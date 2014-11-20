var Express = require('./express'),
  Bunyan = require('bunyan'),
  fs = require('fs'),
  async = require('async');

var Application = module.exports = function (name, path, gryd) {
  this.log = Bunyan.createLogger({name: name});
  this.name = name;
  this.path = path;
  this.gryd = gryd;
  this.app = null;
  this.db = null;
  this.config = null;
};

Application.prototype.initWorker = function (callback) {
  var self = this;
  async.series([
    self.loadConfig.bind(self),
    self.connectDatabase.bind(self),
    self.loadApp.bind(self),
    self.loadModels.bind(self),
    self.loadControllers.bind(self)
  ], function (err) {
    if (err) {
      callback(err);
    } else {
      callback(null,self);
    }
  });
};

Application.prototype.initMaster = function (callback) {
  var self = this;
  async.series([
    self.loadConfig.bind(self),
    self.connectDatabase.bind(self),
    self.loadModels.bind(self),
    self.startDaemons.bind(self)
  ], function (err) {
    if (err) {
      callback(err);
    } else {
      callback(null,self);
    }
  });
};

Application.prototype.loadConfig = function (callback) {
  var self = this;
  var env = self.gryd.env;

  fs.exists(self.path + "/config/" + env + ".js", function (exists) {
    if (exists) {
      self.config = require(self.path + "/config/" + env);
      if (self.config.requestLog)
        self.app.use(self.logRequest.bind(self));
      callback();
    } else {
      callback("Configuration for environment " + env + " does not exist");
    }
  });
};

Application.prototype.connectDatabase = function (callback) {
  var self = this;
  if (self.config.db) {
    var mongoose = require('mongoose');
    mongoose.connect(self.config.db);
    var db = mongoose.connection;

    db.on('error', callback);
    db.once('open', function () {
      self.db = mongoose;
      callback()
    });
  } else {
    callback();
  }
};

Application.prototype.loadApp = function (callback) {
  var self = this;
  fs.exists(self.path + "/index.js", function (exists) {
    if (exists) {
      self.app = Express();
      require(self.path)(self);
    }
    callback();
  });
};

Application.prototype.loadModels = function (callback) {
  var self = this;
  if (self.db) {
    fs.readdir(self.path + "/models", function (err, files) {
      if (err){
        callback(err);
      } else {
        for (var i in files) {
          var model_name = files[i];
          require(self.path + "/models/" + model_name)(self);
        }
        callback();
      }
    });
  } else {
    callback();
  }
};

Application.prototype.loadControllers = function (callback) {
  var self = this;
  fs.readdir(self.path + "/controllers", function (err, files) {
    if (err){
      callback(err);
    } else {
      for (var i in files) {
        var controller_name = files[i];
        var Controller = require(self.path + "/controllers/" + controller_name);
        new Controller(self);
      }
      callback();
    }
  });
};

Application.prototype.startDaemons = function (callback) {
  var self = this;
  fs.exists(self.path + "/daemon.js", function (exists) {
    if (exists) {
      require(self.path)(self);
      callback();
    }
  });
};

Application.prototype.logRequest = function (req, res, next) {
  var self = this;
  self.log.info("[" + getClientIp(req) + "] " + req.method + " " +
  req.hostname + req.originalUrl);
  next();
};

function getClientIp(req) {
  var ipAddress;
  var forwardedIpsStr = req.header('x-forwarded-for');
  if (forwardedIpsStr)
    ipAddress = forwardedIpsStr.split(',')[0];
  if (!ipAddress)
    ipAddress = req.connection.remoteAddress;
  return ipAddress;
}