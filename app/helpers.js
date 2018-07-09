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
