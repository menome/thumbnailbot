var Query = require('decypher').Query;

module.exports = {}

/**
 * Returns a query that updates the given file node with an absolute fuckpile of text
 * in an indexed property.
 */
module.exports.addThumbQuery = function(uuid, thumbpath, thumblibrary) {
  var query = new Query();
  query.match("(f:Card {Uuid: $uuid})", {uuid: uuid})
  query.set("f.Thumbnail = $thumbpath, f.ThumbnailLibrary = $thumbnailLibrary", {thumbpath: thumbpath, thumbnailLibrary: thumblibrary} )
  return query;
}