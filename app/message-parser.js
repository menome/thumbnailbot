"use strict";
const queryBuilder = require('./queryBuilder');
const RabbitClient = require('@menome/botframework/rabbitmq');
const helpers = require('./helpers');
const filepreview = require('filepreview');
const Minio = require('minio');
const {timeout, TimeoutError} = require('promise-timeout');

module.exports = function(bot) {
  var outQueue = new RabbitClient(bot.config.get('rabbit_outgoing'));

  var minioClient = new Minio.Client({
    endPoint: bot.config.get("minio.endPoint"),
    port: bot.config.get("minio.port"),
    secure: bot.config.get("minio.secure"),
    accessKey: bot.config.get("minio.accessKey"),
    secretKey: bot.config.get("minio.secretKey")
  });

  outQueue.connect();

  // First ingestion point.
  this.handleMessage = function(msg) {
    var tmpPath = "/tmp/"+msg.Uuid;
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
    var tmpPath = "/tmp/"+msg.Uuid;

    return helpers.getFile(bot, msg.Library, msg.Path, tmpPath).then((tmpPath) => {
      bot.logger.info("Attempting Thumb Extraction from file '%s'", msg.Path);

      return extractThumb(tmpPath, msg.Uuid).then((path) => {
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
  function extractThumb(localpath, uuid) {
    bot.logger.info("Attempting thumb Extraction for file '%s'", localpath)
    var thumbnailPath = localpath+'-thumbnail.jpg';

    var options = {
      // width: bot.config.get('fss.thumbWidth'), 
      width: 100, 
      quality: 90
    }

    var thumbPromise = new Promise((resolve,reject) => {
      filepreview.generate(localpath,thumbnailPath,options,(err) => {
        if(err) reject(err);

        minioClient.fPutObject('card-thumbs',"File/"+uuid+'.jpg', thumbnailPath, {"Content-Type": "image/jpeg"}, function(err) {
          if(err) return reject(err);

          //We'll remove the generated thumbnail locally
          helpers.deleteFile(thumbnailPath);
          
          var imageUri= 'card-thumbs/File/' + uuid +'.jpg';
          return resolve(imageUri)
          // Set Thumbnail=true on the node to get the thumbnail displaying properly.
          // var enableThumbQuery = queryBuilder.addThumbnailQuery(uri, imageUri)
          
          // return bot.query(enableThumbQuery.compile(),enableThumbQuery.params()).then(function(result) {
          //   bot.logger.info("Enabled thumbnail for file: '%s'", localpath);
          //   return resolve(result);
          // }).catch(function(err) {
          //   bot.logger.error("Could not enable thumbnail for file '%s': %s", localpath, err.message);
          //   // markCorrupt(uri);
          //   return reject(err);
          // })
        });
      })
    })
    
    return timeout(thumbPromise, 10000).catch(function(err) {
      helpers.deleteFile(thumbnailPath);

      if (err instanceof TimeoutError)
        bot.logger.error("Thumbnail generation timed out. Skipping.");
      else
        bot.logger.error("Could not generate thumbnail for file '%s': %s", localpath, err.message);
      
      throw err;
    })
  }

  // Extracts summary text from file
  // function extractThumb(mimetype, file) {
  //   if(textGenerationMimeBlacklist.indexOf(mimetype) === -1) {
  //     return new Promise(function(resolve, reject) {
  //       textract.fromFileWithMimeAndPath(mimetype, file, function( error, text ) {
  //         if(error) return reject(error);
  //         return resolve(truncate(text, 30000));
  //       })
  //     });
  //   }
  //   else {
  //     bot.logger.info("Not a fulltext-extractable MIME type. Skipping.")
  //     return Promise.resolve(false);
  //   }
  // }
}
