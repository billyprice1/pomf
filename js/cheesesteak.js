/**
 * Copyright (c) 2013 Peter Lejeck <peter.lejeck@gmail.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/* jshint browser:true, jquery:true */
(function() {
  // Lightweight EventEmitter implementation
  var EventEmitter = function() {};

  EventEmitter.prototype.on = function(evt, fn) {
    this._events = this._events || {};
    this._events[evt] = this._events[evt] || [];
    this._events[evt].push(fn);
  };

  EventEmitter.prototype.off = function(evt, fn) {
    if (!this.hasOwnProperty('_events') || evt in this._events === false) {
      return;
    }

    this._events[evt].splice(this._events[evt].indexOf(fn), 1);
  };

  EventEmitter.prototype.emit = function(evt) {
    var len = this._events[evt].length;
    var i;

    if (!this.hasOwnProperty('_events') || evt in this._events === false) {
      return;
    }

    for (i = 0; i < len; i++) {
      this._events[evt][i].apply(this, Array.prototype.slice.call(arguments,
        1));
    }
  };

  // Copy the stuff from Array to FileList
  FileList.prototype.forEach = Array.prototype.forEach;
  FileList.prototype.every = Array.prototype.every;
  FileList.prototype.some = Array.prototype.some;
  FileList.prototype.filter = Array.prototype.filter;
  FileList.prototype.map = Array.prototype.map;
  FileList.prototype.reduce = Array.prototype.reduce;
  FileList.prototype.reduceRight = Array.prototype.reduceRight;

  Object.defineProperty(FileList.prototype, 'size', {
    get: function getSize() {
      return this.reduce(function(prev, curr) {
        return prev + curr.size;
      }, 0);
    },
  });

  // Utility to convert bytes into human units
  var humanSize = {
    get: function humanSize() {
      var units = [
        'B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB',
      ];
      var base = Math.floor(Math.log(this.size) / Math.log(1024));
      return (this.size / Math.pow(1024, base)).toFixed(2) + ' ' + units[base];
    },
  };
  Object.defineProperty(FileList.prototype, 'humanSize', humanSize);
  Object.defineProperty(File.prototype, 'humanSize', humanSize);

  var percentUploaded = {
    get: function percentUploaded() {
      return this.uploadedSize / this.size;
    },
  };
  Object.defineProperty(FileList.prototype, 'percentUploaded',
    percentUploaded);
  Object.defineProperty(File.prototype, 'percentUploaded', percentUploaded);

  Object.defineProperty(FileList.prototype, 'uploadedSize', {
    get: function getUploadedSize() {
      return this.reduce(function(prev, curr) {
        return prev + (curr.uploadedSize || 0);
      }, 0);
    },
  });

  // Object URL stuff
  Object.defineProperty(File.prototype, 'url', {
    get: function getURL() {
      return window.URL.createObjectURL(this);
    },
  });
  File.revokeURL = function revokeURL(url) {
    window.URL.revokeObjectURL(url);
  };

  // b gets merged as defaults for a
  var merge = function merge(base, overlay) {
    var out = base;
    for (var key in overlay) {
      if (typeof overlay[key] === 'object') {
        out[key] = merge(base[key], overlay[key]);
      } else {
        out[key] = overlay[key];
      }
    }

    return out;
  };

  var FileListUploader = function(url, files, opts) {
    this.url = url;
    this.files = files;

    var request = opts || {};

    this.opts = merge({
      field: 'files[]',
      method: 'POST',
      data: {},
    }, request);
  };

  FileListUploader.prototype = Object.create(EventEmitter.prototype);
  FileListUploader.prototype.upload = function(cb) {
    var opts = this.opts;
    var files = this.files;
    var _this = this;
    var len = files.length;
    var i;

    if (cb) {
      this.on('uploadcomplete', cb);
    }

    var data = new FormData();
    files.forEach(function(file) {
      data.append(opts.field, file);
    });

    var xhr = new XMLHttpRequest();

    xhr.open(opts.method, this.url, true);

    function initProgressBar(evt) {
      for (i = 0; i < len; i++) {
        files[i].uploadedSize = 0;
      }
    }
    xhr.upload.addEventListener('loadstart', initProgressBar);

    function updateProgressBar(evt) {
      if (evt.lengthComputable) {
        var size = evt.loaded;

        /**
         * We know the size of the files, the order they're in, and how
         * much we've uploaded. Based on this data, we can do some magic
         * to figure out which file we're on, and how much we've uploaded
         * of that file.
         */

        // TODO: This math has trouble on later uploads. Leak somewhere.
        for (i = 0; i < len; i++) {
          files[i].uploadedSize = Math.min(size, files[i].size);
          size -= files[i].uploadedSize;
          if (size <= 0) {
            files.current = files[i];
            size = 0;
          }
        }
      }

      _this.emit('uploadprogress', evt, files);
    }
    xhr.upload.addEventListener('progress', updateProgressBar, false);

    // The upload is complete, now tell the user to wait for URLs.
    function postUpload(evt) {
      _this.emit('uploadcomplete', evt);
    }
    xhr.upload.addEventListener('load', postUpload);

    // Tell the browser the upload completed and wait for response.
    function postProgress(evt) {
      _this.emit('progress', evt);
    }
    xhr.addEventListener('progress', postProgress);

    // Send a success/error response. Nothing more to do.
    function uploadFinished(evt) {
      _this.emit('load', evt, xhr.responseText);
    }
    xhr.addEventListener('load', uploadFinished);

    xhr.send(data);

    // TODO: Add more event passthroughs, maybe abstract it into a helper?
  };

  FileList.prototype.upload = function uploadFileList(url, opts) {
    return new FileListUploader(url, this, opts);
  };
})();
