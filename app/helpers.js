const fs = require("fs");

module.exports = {};

// Get the file from the Librarian. Returns a promise with a path to the file.
// If the file already exists, don't re-download it.
module.exports.getFile = function(bot, libkey, libpath, localpath) {
  if(fs.existsSync(localpath)) return Promise.resolve(localpath);
  return bot.librarian.download(libkey, libpath, localpath)
}

// Delete a file if it exists.
module.exports.deleteFile = function(path) {
  if(fs.existsSync(path)) {
    fs.unlinkSync(path);
  }
}

let fppConfig;
module.exports.getNextRoutingKey = function(status, bot) {
  if(!fppConfig) {
    try {
      fppConfig = JSON.parse(fs.readFileSync('./config/fpp-config.json', 'utf8'));
    }
    catch(err) {
      console.log("Could not find central FPP config file. Defaulting.")
    }
  }

  if(fppConfig && fppConfig[process.env.npm_package_name] && fppConfig[process.env.npm_package_name][status]) {
    return fppConfig[process.env.npm_package_name][status];
  }

  var downstream_actions = bot.config.get('downstream_actions');
  var newRoute = downstream_actions[status];

  return newRoute;
}