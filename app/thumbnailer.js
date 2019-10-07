"use strict";
const path = require("path");
const child_process = require("child_process");
/**
 * Converts images and unoconv-able files into thumbnails of a configured size.
 * Assumes unoconv and imagemagick are installed and present in the PATH
 */
module.exports = {
  makeThumbnail,
  countPdfPages
}

const imageMagickTypes = [
  "application/pdf",
  "image/png",
  "image/bmp",
  "image/cis-cod",
  "image/gif",
  "image/ief",
  "image/jpeg",
  "image/pipeg",
  "image/svg+xml",
  "image/tiff",
  "image/x-cmu-raster",
  "image/x-cmx",
  "image/x-icon",
  "image/x-portable-anymap",
  "image/x-portable-bitmap",
  "image/x-portable-graymap",
  "image/x-portable-pixmap",
  "image/x-rgb",
  "image/x-xbitmap",
  "image/x-xpixmap",
  "image/x-xwindowdump",
]

// Currently just Office documents and PDFs.
const unoconvTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.presentationml.template",
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.text-template",
  "application/vnd.oasis.opendocument.text-web",
  "application/vnd.oasis.opendocument.text-master",
  "application/vnd.oasis.opendocument.graphics",
  "application/vnd.oasis.opendocument.graphics-template",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.presentation-template",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.spreadsheet-template",
  "application/vnd.oasis.opendocument.chart",
  "application/vnd.oasis.opendocument.formula",
  "application/vnd.oasis.opendocument.database",
  "application/vnd.oasis.opendocument.image",
]

// Take file as input
// Options:
//   mime: string (The MIME type of the input data.)
//   width: number
//   height: number
//   page: number. One-indexed. For some reason.
// Returns a promise that has a buffer with PNG image data.
function makeThumbnail(inFilePath, options = {}) {
  if(!options.mimetype) options.mimetype = "application/octet-stream";

  // Determine how we make the thumbnail.
  if(imageMagickTypes.indexOf(options.mimetype) != -1) {
    return imageThumbnail(inFilePath, options)
  }
  else if(unoconvTypes.indexOf(options.mimetype) != -1) {
    return docThumbnail(inFilePath, options)
  }
  else {
    throw new Error("Not a MIME type we can generate a thumbnail for.")
  }
}

// Uses imagemagick to convert.
// Returns a buffer.
function imageThumbnail(inFilePath, {width, height, page}) {
  return new Promise((resolve,reject) => {
    let size = "x";
    if(!width && !height)
      size = "x300";
    else
      size = (width || "") + "x" + (height || "");

    // Cause it's 1-indexed.
    if(page) page = page-1
    else page = 0
    
    let convert_child = child_process.spawn("convert", [
      "-thumbnail", size,
      "-background", "white",
      path.resolve(inFilePath)+"["+page+"]",
      "png:-"
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    var stderr = [];
    convert_child.stderr.on('data', function(data) {
      stderr.push(data);
    })
    
    var stdout = [];
    convert_child.stdout.on('data', function (data) {
      stdout.push(data);
    });

    convert_child.on('exit', function (code) {
      if (code !== 0) {
        return reject(new Error(Buffer.concat(stderr).toString('utf-8')));
      }

      resolve(Buffer.concat(stdout));
    });
  })
}

// More complex.
// Converts docs into PDF, then uses imagemagick for thumbnailage.
function docThumbnail(inFilePath, {width, height, page}) {
  return new Promise((resolve,reject) => {
    var prOption = "PageRange=1"; //1-indexed for some reason.
    if(page) {
      prOption = "PageRange="+page
    }

    let outpdf = child_process.spawn("unoconv", [
      "-f", "pdf",
      "-e", prOption,
      "--stdout",
      inFilePath
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    var unoconv_stderr = [];
    outpdf.stderr.on('data', function(data) {
      unoconv_stderr.push(data);
    })

    outpdf.on('exit', function(code) {
      if (code !== 0) {
        return reject(new Error(Buffer.concat(unoconv_stderr).toString('utf-8')));
      }
    })

    let size = "x";
    if(!width && !height)
      size = "x300";
    else
      size = (width || "") + "x" + (height || "");

    // Make our own pipe! No intermediate files stored on disk.
    let thumbout = child_process.spawn("convert", [
      "-thumbnail", size,
      "-background", "white",
      "-alpha", "remove",
      "pdf:-",
      "jpeg:-"
    ], {
      stdio: [outpdf.stdout, 'pipe', 'pipe']
    });

    var thumbout_stdout = [];
    thumbout.stdout.on('data', function(data) {
      thumbout_stdout.push(data);
    })

    var thumbout_stderr = [];
    thumbout.stderr.on('data', function(data) {
      thumbout_stderr.push(data);
    })

    thumbout.on('exit', function (code) {
      if (code !== 0) {
        return reject(new Error(Buffer.concat(thumbout_stderr).toString('utf-8')));
      }

      resolve(Buffer.concat(thumbout_stdout));
    });
  })
}

function countPdfPages(pdfPath) {
  return new Promise((resolve, reject) => {
    child_process.exec("pdfinfo "+pdfPath+" | grep Pages: | awk '{print $2}'", (error, stdout) => {
      if(error) return reject(error)
      return resolve(parseInt(stdout));
    });
  })
}