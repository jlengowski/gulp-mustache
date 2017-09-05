'use strict';

var through = require('through2');
var gutil = require('gulp-util');
var mustache = require('mustache');
var fs = require('fs');
var path = require('path');
var escapeRegex = require('escape-string-regexp');

module.exports = function (view, options, partials) {
    options = options || {};
    partials = partials || {};

    var viewError = null;

    if (options.tags) {
        mustache.tags = options.tags;
    }

    // if view is string, interpret as path to json filename
    if (typeof view === 'string') {
        try {
            view = JSON.parse(fs.readFileSync(view, 'utf8'));
        } catch (e) {
            viewError = e;
        }
    }

    return through.obj(function (file, enc, cb) {

        if (file.isNull()) {
            this.push(file);
            return cb();
        }

        if (file.isStream()) {
            this.emit(
                'error',
                new gutil.PluginError('gulp-mustache', 'Streaming not supported')
            );
        }

        if (viewError) {
            this.emit(
                'error',
                new gutil.PluginError('gulp-mustache', viewError.toString())
            );
        }

        var template = file.contents.toString();
        try {
            loadPartials.call(this, template, file.path);
        } catch (e) {
            this.emit(
                'error',
                new gutil.PluginError('gulp-mustache', e.message)
            );
        }

        try {
            
            var data = file.path.substr(file.path.lastIndexOf("/") + 1).replace("html", "json");

            data = process.cwd() + "/src/json/" + data;
            data = fs.existsSync(data) ? JSON.parse(fs.readFileSync(data, "utf8")) : {};

            var full = process.cwd() + "/" + file.path;
            var part = full.substr(full.lastIndexOf("/html/") + 6);

            var webRoot = "";

            if ( part.substr(0, 8) !== "partials" ) {
                var parts = part.split("/");
                if (parts && parts.length && parts.length >= 2) {
                    for (var i = 1; i < parts.length; i ++) {
                        webRoot = webRoot + "../";
                    }
                }
            }

            Object.assign(data, { webRoot: webRoot });

            file.contents = new Buffer(
                mustache.render(template, data || file.data || view, partials)
            );

        } catch (e) {
            this.emit(
                'error',
                new gutil.PluginError('gulp-mustache', e.message)
            );
        }

        if (typeof options.extension === 'string') {
            file.path = gutil.replaceExtension(file.path, options.extension);
        }
        this.push(file);
        cb();
    });

    // find and load partials not already in partials list from disk, recursively
    function loadPartials(template, templatePath) {
        var templateDir = path.dirname(templatePath);

        var partialRegexp = new RegExp(
            escapeRegex(mustache.tags[0]) + '>\\s*(\\S+)\\s*' + escapeRegex(mustache.tags[1]), 'g'
        );

        var partialMatch;
        while (partialMatch = partialRegexp.exec(template)) {
            var partialName = partialMatch[1];

            if (!partials[partialName]) {
                try {
                    var partialPath = null;
                    var partial = null;

                    // ignore `partial` with file extension.
                    // e.g.
                    //   1, `{{> ./path/to/partial.html }}`
                    //   2, `{{> ./path/to/partial. }}`
                    if ( path.extname(partialName) != "" ) {
                        partialPath = path.resolve(templateDir, partialName);
                        partial = fs.readFileSync(partialPath, 'utf8');
                    }

                    else {
                        // ignore `partial` file is exists without file extension.
                        // e.g.
                        //   1, `{{> ./path/to/partial }}` is exists.
                        //   2, `{{> ./path/to/.partial }}` is exists.
                        partialPath = path.resolve(templateDir, partialName);

                        if ( fs.existsSync(partialPath) ) {
                            partial = fs.readFileSync(partialPath, 'utf8');
                        }

                        else {
                            // or check if `partial + options.extension` is exists.
                            // e.g.
                            //   if `options.extension` equals ".html":
                            //   the `{{> ./path/to/partial }}` will load
                            //   `./path/to/partial.html`.
                            if ( typeof options.extension == "string" ) {
                                partialPath = path.resolve(
                                    templateDir,
                                    partialName + options.extension
                                );

                                if ( fs.existsSync(partialPath) ) {
                                    partial = fs.readFileSync(partialPath, 'utf8');
                                }
                            }

                            // when `options.extension` is not a string or
                            // `partialName + options.extension` does not exists.
                            // try use `.mustache` extension to load `partial` file.
                            if ( partial === null ) {
                                partialPath = path.resolve(
                                    templateDir,
                                    partialName + ".mustache"
                                );

                                partial = fs.readFileSync(partialPath, 'utf8');
                            }
                        }
                    }

                    partials[partialName] = partial;
                    loadPartials.call(this, partial, partialPath);
                } catch (ex) {
                     this.emit(
                        'error',
                        new gutil.PluginError(
                            'gulp-mustache',
                            // use `ex.message` property instead of `partialPath`,
                            // because `this.emit()` seems not a sync method.
                            // also the `ex.message` property provide more details
                            // about error information.
                            'Unable to load partial file: ' + ex.message/*partialPath*/
                        )
                     );
                }
            }
        }
    }
};

module.exports.mustache = mustache;
