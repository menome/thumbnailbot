"use strict";
const queryBuilder = require('./queryBuilder');
const RabbitClient = require('@menome/botframework/rabbitmq');
const helpers = require('./helpers');
const thumbnailer = require("./thumbnailer");
const Minio = require('minio');
const {timeout, TimeoutError} = require('promise-timeout');

module.exports = function(bot) {
  var outQueue = new RabbitClient(bot.config.get('rabbit_outgoing'));

  var minioClient = new Minio.Client({
    endPoint: bot.config.get("minio.endPoint"),
    port: bot.config.get("minio.port"),
    useSSL: bot.config.get("minio.useSSL"),
    accessKey: bot.config.get("minio.accessKey"),
    secretKey: bot.config.get("minio.secretKey")
  });

  outQueue.connect();

  // First ingestion point.
  this.handleMessage = function(msg) {
    var tmpPath = "/tmp/thumb-"+msg.Uuid;

    return processMessage(msg).then((resultStr) => {
      var downstream_actions = bot.config.get('downstream_actions');
      var newRoute = downstream_actions[resultStr];

      if(newRoute === false || newRoute === undefined) {
        helpers.deleteFile(tmpPath);
        return bot.logger.info("No next routing key.");
      }

      if(typeof newRoute === "string") {
        bot.logger.info("Next routing key is '%s'", newRoute)
        return outQueue.publishMessage(msg, "fileProcessingMessage", {routingKey: newRoute});
      }
      else if(Array.isArray(newRoute)) {
        bot.logger.info("Next routing keys are '%s'", newRoute.join(', '))
        newRoute.forEach((rkey) => {
          return outQueue.publishMessage(msg, "fileProcessingMessage", {routingKey: rkey});
        })
      }
    }).catch((err) => {
      bot.logger.error(err);
      helpers.deleteFile(tmpPath);
    })
  }

  //////////////////////////////
  // Internal/Helper functions

  function processMessage(msg) {
    var mimetype = msg.Mime;
    if(!mimetype) mimetype = "application/octet-stream";
    var tmpPath = "/tmp/thumb-"+msg.Uuid;

    return helpers.getFile(bot, msg.Library, msg.Path, tmpPath).then((tmpPath) => {
      bot.logger.info("Attempting Thumb Extraction from file '%s'", msg.Path);

      return extractThumb(tmpPath, mimetype, msg.Uuid).then((path) => {
        if(path === false) return;
        var thumbQuery = queryBuilder.addThumbQuery(msg.Uuid, path);
        return bot.neo4j.query(thumbQuery.compile(), thumbQuery.params()).then(() => {
          bot.logger.info("Added thumbnail to file %s", msg.Path);
          return "success";
        })
      }).catch(err => {
        bot.logger.error(err)
        return "error";
      })
    })
  }


  // Gets a thumbnail for the file.
  function extractThumb(localpath, mimetype, uuid) {
    bot.logger.info("Attempting thumb Extraction for file '%s'", localpath)

    var options = {
      mimetype,
      width: 300,
      height: 300
    }

    var thumbPromise = thumbnailer.makeThumbnail(localpath, options).then((buffer) => {
      var imageUri= 'card-thumbs/File/' + uuid +'.png';
      return minioClient.putObject('card-thumbs',"File/"+uuid+'.png', buffer, {"Content-Type": "image/png"}).then(() => {
        return imageUri;
      });
    })

    return timeout(thumbPromise, 500000).catch(function(err) {
      if (err instanceof TimeoutError)
        bot.logger.error("Thumbnail generation timed out. Skipping.");
      else
        bot.logger.error("Could not generate thumbnail for file '%s': %s", localpath, err.message);
      
      throw err;
    })
  }
}
