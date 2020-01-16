"use strict";
const queryBuilder = require('./queryBuilder');
const RabbitClient = require('@menome/botframework/rabbitmq');
const helpers = require('./helpers');
const thumbnailer = require("./thumbnailer");
const { timeout, TimeoutError } = require('promise-timeout');

module.exports = function (bot) {
  var outQueue = new RabbitClient(bot.config.get('rabbit_outgoing'));

  outQueue.connect();

  // First ingestion point.
  this.handleMessage = function (msg) {
    var tmpPath = "/tmp/thumb-" + msg.Uuid;

    return processMessage(msg).then((resultStr) => {
      var newRoute = helpers.getNextRoutingKey(resultStr, bot);

      if (newRoute === false || newRoute === undefined) {
        helpers.deleteFile(tmpPath);
        return bot.logger.info("No next routing key.");
      }

      if (typeof newRoute === "string") {        
        bot.logger.info("Next routing key", {routingKey:newRoute})
        return outQueue.publishMessage(msg, "fileProcessingMessage",  );
      }
      else if (Array.isArray(newRoute)) {
        bot.logger.info("Next routing keys", {routingKey:newRoute.join(', ')})
        newRoute.forEach((rkey) => {
          return outQueue.publishMessage(msg, "fileProcessingMessage", { routingKey: rkey });
        })
      }
    }).catch((err) => {
      bot.logger.error("problem processing message",{error:err,msg:msg});
      helpers.deleteFile(tmpPath);
    })
  }

  //////////////////////////////
  // Internal/Helper functions

  function processMessage(msg) {
    var mimetype = msg.Mime;
    if (!mimetype) mimetype = "application/octet-stream";
    var tmpPath = "/tmp/thumbgen-" + msg.Uuid;

    return helpers.getFile(bot, msg.Library, msg.Path, tmpPath).then((tmpPath) => {
      if (bot.config.get("paginate") && mimetype === 'application/pdf') {
        bot.logger.info("Attempting page-based Thumb Extraction from file", {path:msg.Path});
        return thumbnailer.countPdfPages(tmpPath).then(async (pageCount) => {
          for (let pageno = 1; pageno <= pageCount; pageno++) { // Pages are 1-indexed for this case.
            var pageUuid = bot.genUuid()
            let thumbpath;
            try {
              thumbpath = await extractImage(tmpPath, mimetype, msg.Uuid, pageno)
              if (!thumbpath) continue;
            } catch(err) {
              continue;
            }            

            let thumbQuery = queryBuilder.addThumbPageQuery({ uuid: msg.Uuid, pageUuid, thumbpath, thumblibrary: bot.config.get("thumbnailLibrary"), pageno });
            await bot.neo4j.query(thumbQuery.compile(), thumbQuery.params())

            if (bot.config.get("generateHighRes")) {
              let imagePath;
              try {
                imagePath = await extractImage(tmpPath, mimetype, msg.Uuid, pageno, "page-image")
                if (!imagePath) continue;
              } catch(err) {
                continue;
              }
              
              let pageQuery = queryBuilder.addImagePageQuery({ uuid: msg.Uuid, pageUuid, imagePath, thumblibrary: bot.config.get("thumbnailLibrary"), pageno });
              await bot.neo4j.query(pageQuery.compile(), pageQuery.params()).then((result) => {
                //publish on rabbit
                var pageMsg = {
                  "Uuid": result.records[0].get("uuid"),
                  "Library": bot.config.get("thumbnailLibrary"),
                  "Path": imagePath
                }
                var sent = outQueue.publishMessage(pageMsg, "fileProcessingMessage", {
                  routingKey: 'fpp.table_detector_queue',
                  exchange: 'fpp'
                })
                if (sent === true)
                  bot.logger.info("Sent page information to table detector.")
              })
            }

            // If it's the first page, also set this as the doc's thumb.
            if (pageno === 1) {
              let docThumbQuery = queryBuilder.addThumbQuery(msg.Uuid, thumbpath, bot.config.get("thumbnailLibrary"));
              await bot.neo4j.query(docThumbQuery.compile(), docThumbQuery.params())
            }

            bot.logger.info("Added images", {pageno:pageno,msg:msg});
          }
        }).catch(err => {
          bot.logger.error("problem processing message",{error:err,msg:msg});
          return "error";
        })
      } else {
        bot.logger.info("Attempting single Thumb Extraction from file",{path:msg.Path});
        return extractImage(tmpPath, mimetype, msg.Uuid).then((path) => {
          if (path === false) return;
          var thumbQuery = queryBuilder.addThumbQuery(msg.Uuid, path, bot.config.get("thumbnailLibrary"));
          return bot.neo4j.query(thumbQuery.compile(), thumbQuery.params()).then(() => {
            bot.logger.info("Added thumbnail to file", {path:msg.Path});
            var propagateQuery = queryBuilder.propagateThumbQuery(msg.Uuid);
            return bot.neo4j.query(propagateQuery.compile(), propagateQuery.params()).then((result) => {
              if (result.records[0].get('count').toNumber() > 0) {
                bot.logger.info("Added additional card thumbnails.", {path:msg.Path,count:result.records[0].get('count')});
              }

              return "success";
            })
          })
        }).catch(err => {
          bot.logger.error("problem single thumb extraction",{error:err,msg:msg});
          return "error";
        })
      }
    })
  }

  // Generate an image for the file. Page argument is 1-indexed.
  function extractImage(localpath, mimetype, fileUuid, page = 1, type = "page-thumb") {
    var options = {
      mimetype,
      width: type === "page-thumb" ? 600 : bot.config.get("highResWidth"),
      page,
      density: type === "page-thumb" ? 150 : 300,
    }

    var imagePromise = thumbnailer.makeThumbnail(localpath, options).then((buffer) => {
      var imageUri = bot.config.get("thumbnailPrefix").trimRight("/") + "/" + fileUuid + "/" + type + "-" + page + ".png";
      return bot.librarian.upload(bot.config.get("thumbnailLibrary"), imageUri, buffer, "image/png", type + "-" + page + ".png").then(() => {
        return imageUri;
      })
    })

    return timeout(imagePromise, bot.config.get("timeout")).catch(function (err) {
      if (err instanceof TimeoutError)
        bot.logger.error("Thumbnail generation timed out. Skipping.",{localpath:localpath,error:err.message});
      else
        bot.logger.error("Could not generate thumbnail", {localpath:localpath,error:err.message});

      throw err;
    })
  }
}
