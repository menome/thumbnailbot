/** 
 * Copyright (C) 2018 Menome Technologies Inc.  
 * 
 * FPP Bot for extracting Thumbnails from files.
 */
"use strict";
const Bot = require('@menome/botframework');
const config = require("../config/config.json");
const configSchema = require("./config-schema");
const messageParser = require("./message-parser");

// Start the actual bot here.
var bot = new Bot({
  config: {
    "name": "FPP Thumbnail bot",
    "desc": "Extracts thumbnails from files.",
    ...config
  },
  configSchema
});

// Listen on the Rabbit bus.
var mp = new messageParser(bot);
bot.rabbit.addListener("thumbnail_queue", mp.handleMessage, "fileProcessingMessage");

bot.start();
bot.changeState({state: "idle"});