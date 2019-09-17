# FPP Thumbnail Bot

Bot that extracts thumbnails from files.

## Usage / Output

When the bot receives a message with a library key for the files it generates, it generates files in the following pattern:

* Library
  * Prefix Prefix (By default: file-artifacts)
    * Associated (file) Card UUID
      * page-thumb-1.png
      * page-thumb-2.png
      * ... etc
      * page-image-1.png
      * page-image-2.png
      * ... etc