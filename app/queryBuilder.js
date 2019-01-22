var Query = require('decypher').Query;

module.exports = {}

module.exports.addThumbQuery = function(uuid, thumbpath, thumblibrary) {
  var query = new Query();
  query.match("(f:Card {Uuid: $uuid})", {uuid: uuid})
  query.set("f.Thumbnail = $thumbpath, f.ThumbnailLibrary = $thumbnailLibrary", {thumbpath: thumbpath, thumbnailLibrary: thumblibrary} )
  return query;
}

/**
 * If a card without a thumbnail is linked to this file, and this file has a thumbnail, then propagate the thumbnail.
 */
module.exports.propagateThumbQuery = function(uuid) {
  var query = new Query();
  query.match("(f:Card {Uuid: $uuid})<-[:CARD_HAS_FILE]-(c:Card)", {uuid: uuid})
  query.where("NOT EXISTS(c.Thumbnail)")
  query.set("c.Thumbnail = f.Thumbnail, c.ThumbnailLibrary = f.ThumbnailLibrary")
  query.return("COUNT(c) as count")
  return query;
}
