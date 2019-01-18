/**
 * Copyright (c) 2017 Menome Technologies Inc.
 * Configuration for the bot
 */
"use strict";

module.exports = {
  rabbit_outgoing: {
    url: {
      doc: "The URL of the rabbitmq endpoint. ",
      format: String,
      default: "amqp://rabbitmq:rabbitmq@rabbit:5672?heartbeat=3600",
      env: "RABBIT_OUTGOING_URL",
      sensitive: true
    },
    routingKey: {
      doc: "The URL of the rabbitmq endpoint. ",
      format: String,
      default: "syncevents.harvester.updates.example",
      env: "RABBIT_OUTGOING_ROUTING_KEY"
    },
    exchange: {
      doc: "The RMQ Exchange we're connecting to",
      format: String,
      default: "syncevents",
      env: "RABBIT_OUTGOING_EXCHANGE"
    },
    exchangeType: {
      doc: "The type of RMQ exchange we're creating",
      format: ["topic","fanout"],
      default: "topic",
      env: "RABBIT_OUTGOING_EXCHANGE_TYPE"
    },
    prefetch: {
      doc: "Number of items we can be processing concurrently",
      format: Number,
      default: 5,
      env: "RABBIT_OUTGOING_PREFETCH" 
    }
  },
  minio: {
    endPoint: {
      doc: "The URL of the Minio instance",
      format: "*",
      default: "minio",
      env: "MINIO_HOSTNAME"
    },
    port: {
      doc: "The Port of the Minio instance",
      format: "port",
      default: 9000,
      env: "MINIO_PORT"
    },
    useSSL: {
      doc: "Do we use SSL to connect to Minio?",
      format: "Boolean",
      default: false,
      env: "MINIO_SECURE"
    },
    accessKey: {
      doc: "S3-Style Access Key for Minio",
      format: "*",
      default: 'abcd123',
      env: "MINIO_ACCESS_KEY"
    },
    secretKey: {
      doc: "S3-Style Secret Key for Minio",
      format: "*",
      default: 'abcd12345',
      env: "MINIO_SECRET_KEY",
      sensitive: true
    },
    fileBucket: {
      doc: "The name of the bucket we'll crawl on full sync",
      format: "*",
      default: 'filestore'
    }
  },
  downstream_actions: { // Tells us where to put stuff based on 
    doc: "Key/value pairs. keys are string-type result codes. Values are the next routing key to push the message to, or false to end the processing.",
    default: { success: false, error: false},
    format: function check(routing) {
      Object.keys(routing).forEach((key) => {
        if(typeof routing[key] !== 'string' && routing[key] !== false && !Array.isArray(routing[key]))
          throw new Error("Routing keys must be strings, or 'false'.")
      })
    }
  },
  thumbnailLibrary: {
    doc: "Which library to upload thumbnails to",
    format: String,
    default: "miniofiles",
    env: "THUMBNAIL_LIBRARY"
  },
  thumbnailPrefix: {
    doc: "Path prefix where thumbnails should be placed within the library",
    format: String,
    default: "card-thumbs",
    env: "THUMBNAIL_PREFIX"
  },
};