/**
 * Project Name: Gryd
 * Author: Aaron Blankenship
 * Date: 7-25-2015
 *
 * Copyright (c) 2015, Aaron Blankenship
 * Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee
 * is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE
 * INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE
 * FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
 * OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING
 * OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 */

"use strict";

var _        = require('lodash');
var fs       = require('fs');
var express  = require('./express.js');
var Mongoose = require('Mongoose');
var Bunyan   = require('bunyan');

var default_settings = {
  env: process.env.gryd_env || "dev",
  port: process.env.gryd_port || 8000
};

module.exports = function (app_dir, sett) {
  var settings = _.clone(default_settings);
  _.merge(settings, sett);
  fs.exists(app_dir, function (exists) {
    if (exists) {
      initApp(app_dir, settings);
    } else {
      throw new ReferenceError("Invalid `app_dir` " + app_dir);
    }
  });
};

function initApp (app_dir, settings) {
  var Gryd = {
    Settings: settings,
    AppDirectory: app_dir,
    App: express(),
    Express: express,
    Log: Bunyan.createLogger({name: "Gryd." + settings.env})
  };

  global.$G = function (prop) {
    return (prop ? (Gryd.hasOwnProperty(prop) ? Gryd[prop] : null) : Gryd);
  };

  loadConfig(Gryd, function (result) {
    Gryd = result;
    loadDB(Gryd, function (result) {
      Gryd = result;
      loadModules(result, "Mod", function (result) {
        Gryd = result;
        loadModules(result, "Srv", function (result) {
          Gryd = result;
          loadModules(result, "Ctrl", function (result) {
            Gryd = result;
            require(Gryd.AppDirectory);
            Gryd.App.listen(Gryd.Settings.port);
            Gryd.Log.info("Application running on port " + Gryd.Settings.port);
          });
        });
      });
    });
  });
}

function loadConfig (env, callback) {
  var path = env.AppDirectory + "/config/" + env.Settings.env + ".js";
  fs.exists(path, function (exists) {
    if (exists) {
      env.Config = require(path);
      callback(env);
    } else {
      throw new Error("Application config file missing for environment " + env.Settings.env);
    }
  });
}

function loadDB (env, callback) {
  if (env.Config.db) {
    Mongoose.connect(env.Config.db);
    env.DB = Mongoose;
    callback(env);
  } else {
    callback(env);
  }
}

function loadModules (env, type, callback) {
  var dir = null;
  switch (type) {
    case "Srv":
      dir = "/services";
      break;
    case "Mod":
      if (env.Config.db) {
        dir = "/models";
      }
      break;
    case "Ctrl":
      dir = "/controllers";
      break;
    default:
      throw new ReferenceError("Invalid module type " + type);
      break;
  }
  if (dir) {
    var path = env.AppDirectory + dir;
    fs.exists(path, function (exists) {
      if (exists) {
        fs.readdir(path, function (err, files) {
          if (err) {
            throw new Error(err);
          } else {
            files       = stripHiddenFiles(files);
            var modules = {};
            for (var i in files) {
              var filename        = files[i];
              var modulename      = filename.replace(".js", "");
              modules[modulename] = require(path + "/" + filename);
            }
            env[type] = modules;
            callback(env);
          }
        });
      } else {
        throw new ReferenceError(type + " module folder " + path + " does not exists");
      }
    });
  } else {
    callback(env);
  }
}

function stripHiddenFiles (files) {
  var stripped = [];
  for (var i in files) {
    if (files[i].indexOf(".") != 0) {
      stripped.push(files[i]);
    }
  }
  return stripped;
}