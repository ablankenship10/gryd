/**
 * Project Name: Gryd
 * Author: Aaron Blankenship
 * Date: 11-07-2014
 *
 * Copyright (c) 2014, Aaron Blankenship

 * Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee
 * is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE
 * INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE
 * FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
 * OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING
 * OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 */

var fs = require('fs');
var bunyan = require('bunyan');
var express = require('./express');
var logger = bunyan.createLogger({name: "GrydProcess"});

var port = process.env.gryd_port || 8000;
var env = process.env.gryd_environment || "dev";
var logging = (process.env.gryd_logging == "true");

module.exports = function (app_path, gryd_opts) {
  if (gryd_opts) {
    port = gryd_opts.hasOwnProperty("port") ? gryd_opts.port : port;
    env = gryd_opts.hasOwnProperty("env") ? gryd_opts.env : env;
    logging = gryd_opts.hasOwnProperty("logging") ? gryd_opts.logging : logging;
  }
  fs.readdir(app_path, function (err, files) {
    if (err) logger.info("Application path doesn't exist " + app_path);
    var GlobalApp = express();
    if (logging)
      GlobalApp.use(requestLogging);
    for (var i in files) {
      var app_name = files[i];
      var path = app_path + "/" + app_name;
      loadApp(app_name, path, function (name, app_data) {
        app_data.log.info("Application ready");
        GlobalApp.use("/" + name, app_data.app);
      });
    }
    GlobalApp.listen(port);
    logger.info("Listening on port " + port);
  });
};

function loadApp(app_name, path, callback) {
  var log = bunyan.createLogger({name: app_name});
  loadConfig(path, function (config) {
    if (config) {
      connectDb(config.db, function (db) {
        if (db) {
          initApp(path, config, db, log, function (app_data) {
            loadModels(path, app_data, function () {
              loadControllers(path, app_data, function () {
                callback(app_name, app_data);
              });
            });
          });
        } else {
          log.error("Unable to connect to database");
        }
      });
    } else {
      log.error("No configuration available for environment " + env);
    }
  });
}

function loadConfig(path, callback) {
  fs.exists(path + "/config/" + env + ".js", function (exists) {
    exists ? callback(require(path + "/config/" + env)) : callback(null);
  });
}

function connectDb(dbpath, callback) {
  var mongoose = require('mongoose');
  mongoose.connect(dbpath);
  var db = mongoose.connection;

  db.on('error', function () {
    callback(null)
  });
  db.once('open', function () {
    callback(mongoose)
  });
}

function initApp(path, config, db, log, callback) {
  var data = {config: config, db: db, log: log, app: express()};
  require(path)(data);
  callback(data);
}

function loadModels(path, data, callback) {
  fs.readdir(path + "/models", function (err, files) {
    if (err) throw err;
    for (var i in files) {
      var model_name = files[i];
      require(path + "/models/" + model_name)(data);
    }
    callback();
  });
}

function loadControllers(path, data, callback) {
  fs.readdir(path + "/controllers", function (err, files) {
    if (err) throw err;
    for (var i in files) {
      var controller_name = files[i];
      var Controller = require(path + "/controllers/" + controller_name);
      new Controller(data);
    }
    callback();
  });
}

function getClientIp(req) {
  var ipAddress;
  var forwardedIpsStr = req.header('x-forwarded-for');
  if (forwardedIpsStr)
    ipAddress = forwardedIpsStr.split(',')[0];
  if (!ipAddress)
    ipAddress = req.connection.remoteAddress;
  return ipAddress;
}

function requestLogging(req, res, next) {
  logger.info("[" + getClientIp(req) + "] " + req.method + " " +
    req.hostname + req.originalUrl);
  next();
}