var Query = require('decypher').Query;

module.exports = {}

module.exports.addThumbQuery = function(uuid, thumbpath, thumblibrary) {
  var query = new Query();
  query.match("(f:Card {Uuid: $uuid})", {uuid: uuid})
  query.set("f.Thumbnail = $thumbpath, f.ThumbnailLibrary = $thumbnailLibrary", {thumbpath: thumbpath, thumbnailLibrary: thumblibrary} )
  return query;
}

/**
 * Returns a query that adds a thumbnail to a page node.
 */
module.exports.addThumbPageQuery = function({uuid, pageUuid, thumbpath, thumblibrary, pageno}) {
  var query = new Query();
  query.match("(f:Card {Uuid: $uuid})", {uuid})
  query.merge("(f)-[:HAS_PAGE]->(p:Card:Page {PageNumber: $pageno}) ON CREATE SET p.Uuid = $pageUuid", {pageno, pageUuid})
  query.set("p.Thumbnail = $thumbpath, p.ThumbnailLibrary = $thumblibrary", {thumbpath, thumblibrary})
  return query;
}

/**
 * Returns a query that adds a high res image to a page node.
 */
module.exports.addImagePageQuery = function({uuid, pageUuid, imagePath, thumblibrary, pageno}) {
  var query = new Query();
  query.merge("(f:Card {Uuid: $uuid})", {uuid})
  query.merge("(f)-[:HAS_PAGE]->(p:Card:Page {PageNumber: $pageno}) ON CREATE SET p.Uuid = $pageUuid", {pageno, pageUuid})
  query.set("p.Image = $imagePath, p.ImageLibrary = $thumblibrary", {imagePath, thumblibrary})
  query.return("p.Uuid as uuid")
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
