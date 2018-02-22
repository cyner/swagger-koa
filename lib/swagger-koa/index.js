var _ = require('underscore');
var async = require('async');
var fs = require('fs');
var path = require('path');
var yaml = require('js-yaml');
var coffee = require('coffee-script');
var url = require('url');
var koa = require('koa');
var mount = require('koa-mount');
var serve = require('koa-static');
var route = require('koa-route');
var prettyjson = require('prettyjson');

var doctrine = require('doctrine');
var descriptor = {};
var resources = {};


/**
 * Print debug if opt.debug is true
 * @param  {String}   title
 * @param  {String}   message
 */
var _debug = false;
function debug(title, message) {
  if (_debug) {
    console.log(title);
    console.log('------------------');
    console.log(message);
    console.log('');
  }
}

/**
 * Read from yml file
 * @api    private
 * @param  {String}   file
 * @param  {Function} fn
 */
function readYml(file, fn) {
  var resource = require(path.resolve(process.cwd(), file));
  var api = {};

  api.resourcePath = resource.resourcePath;
  api.description = resource.description;
  descriptor.apis.push(api);

  // create apis array
  var apis = resource.apis || resource.paths;
  if (apis) {
    if (apis instanceof Array) {
      resource.apis = apis;
    } else {
      resource.apis = [];
      for (var ak in apis) {
        var obj = {}; obj[ak] = apis[ak];
        resource.apis.push(obj);
      }
    }
  }

  // create models object
  var models = resource.models || resource.definitions;
  if (resource.definitions) {
    if (models instanceof Array) {
      resource.models = {};
      for(var i = 0; i < models.length; i++) {
        for (var mk in models[i]) {
          resource.models[mk] = models[i][mk];
        }
      }
    } else {
      resource.models = models;
    }
  }

  delete resource.definitions;
  delete resource.paths;

  resources[resource.resourcePath] = resource;
  fn();
}

/**
 * Parse jsDoc from a js file
 * @api    private
 * @param  {String}   file
 * @param  {Function} fn
 */
function parseJsDocs(file, fn) {
  fs.readFile(file, function(err, data) {
    if (err) {
      fn(err);
    }

    var js = data.toString();
    var regex = /\/\*\*([\s\S]*?)\*\//gm;
    var fragments = js.match(regex);
    var docs = [];

    if (!fragments) {
      fn(null, docs);
      return;
    }

    for (var i = 0; i < fragments.length; i++) {
      var fragment = fragments[i];
      var doc = doctrine.parse(fragment, {unwrap: true});
      doc.file = file;
      docs.push(doc);

      if (i === fragments.length - 1) {
        fn(null, docs);
      }
    }
  });
}

/**
 * Parse coffeeDoc from a coffee file
 * @api    private
 * @param  {String}   file
 * @param  {Function} fn
 */
function parseCoffeeDocs(file, fn) {
  fs.readFile(file, function(err, data) {
    if (err) {
      fn(err);
    }

    var js = coffee.compile(data.toString());
    var regex = /\/\**([\s\S]*?)\*\//gm;
    var fragments = js.match(regex);
    var docs = [];

    for (var i = 0; i < fragments.length; i++) {
      var fragment = fragments[i];
      var doc = doctrine.parse(fragment, {unwrap: true});

      docs.push(doc);

      if (i === fragments.length - 1) {
        fn(null, docs);
      }
    }
  });
}

/**
 * Get jsDoc tag with title '@swagger'
 * @api    private
 * @param  {Object} fragment
 * @param  {Function} fn
 */
function getSwagger(fragment, fn) {
  for (var i = 0; i < fragment.tags.length; i++) {
    var tag = fragment.tags[i];
    if ('swagger' === tag.title) {
      try {
        yaml.safeLoadAll(tag.description, fn);
      } catch(e) {
        console.error("Error parsing descriptor in file " + fragment.file + ": ", e);
        process.exit(1);
      }
    }
  }

  return fn(false);
}

/**
 *
 * @param {Object} api
 */
function pushApiIfDoesNotExist(api) {
  var found = _.findWhere(descriptor.apis, {resourcePath: api.resourcePath});

  if (found) {
    return;
  }

  descriptor.apis.push(api);
}

/**
 *
 * @param {Function} fn
 * @returns {Function}
 */
function createParserCb(fn) {
  return function(err, docs) {

    if (err) {
      fn(err);
    }

    var resource = {apis: []};

    async.eachSeries(docs, function(doc, cb) {

      getSwagger(doc, function(api) {

        if (!api) {
          return cb();
        }

        // do not rewrite existing resource
        if (resources[api.resourcePath]) {
          resource = resources[api.resourcePath];
        }

        if (api.resourcePath) {
          pushApiIfDoesNotExist(api);
          resource.resourcePath = api.resourcePath;
        } else if (api.models || api.definitions) {
          resource.models = Object.assign({}, resource.models || {}, api.models || api.definitions);
        } else {
          resource.apis.push(api);
        }

        cb();
      });
    }, function(err) {
      resources[resource.resourcePath] = resource;
      fn();
    });
  };
}

/**
 * Read from jsDoc
 * @api    private
 * @param  {String}  file
 * @param  {Function} fn
 */
function readJsDoc(file, fn) {
  parseJsDocs(file, createParserCb(fn));
}

/**
 * Read from coffeeDoc
 * @api    private
 * @param  {String}  file
 * @param  {Function} fn
 */
function readCoffee(file, fn) {
  parseCoffeeDocs(file, createParserCb(fn));
}

/**
 * Read API from file
 * @api    private
 * @param  {String}   file
 * @param  {Function} fn
 */
function readApi(file, fn) {
  var ext = path.extname(file);
  if ('.js' === ext) {
    readJsDoc(file, fn);
  } else if ('.yml' === ext) {
    readYml(file, fn);
  } else if ('.coffee' === ext) {
    readCoffee(file, fn);
  } else {
    throw new Error('Unsupported extension \'' + ext + '\'');
  }
}

/**
 * Generate Swagger documents
 * @api    private
 * @param  {Object} opt
 */
function generate(opt) {

  if (!opt) {
    throw new Error('\'option\' is required.');
  }

  if (!opt.swaggerUI) {
    throw new Error('\'swaggerUI\' is required.');
  }

  var swaggerVersion =
    opt.swaggerVersion ||
    opt.descriptor.swaggerVersion ||
    opt.descriptor.swagger ||
    '1.0';

  opt.swaggerVersion = swaggerVersion;
  opt._version       = Number(swaggerVersion.substr(0,1));

  opt.swaggerURL     = opt.swaggerURL  || '/swagger';
  opt.swaggerJSON    = opt.swaggerJSON || '/api-docs.json';


  if (opt._version === 2) {

    // swagger v2 -- use descriptor field
    if (!opt.descriptor) {
      throw new Error('\'descriptor\' is required.');
    }

    descriptor = opt.descriptor;

    if (!descriptor.swagger) {
      descriptor.swagger = swaggerVersion;
    }

    if (!opt.fullSwaggerJSONPath) {
      opt.fullSwaggerJSONPath = url.parse(opt.swaggerJSON).path;
    }

  } else {

    // swagger v1
    descriptor.swaggerVersion = swaggerVersion;
    descriptor.apiVersion     = opt.apiVersion;
    descriptor.basePath       = opt.basePath;
    descriptor.swaggerURL     = opt.swaggerURL;
    descriptor.swaggerJSON    = opt.swaggerJSON;

    if (opt.info) {
      descriptor.info = opt.info;
    }

    if (!opt.fullSwaggerJSONPath) {
      opt.fullSwaggerJSONPath = url.parse(opt.basePath + opt.swaggerJSON).path;
    }
  }
  descriptor.apis = [];

  debug('SWAGGER OPTIONS', prettyjson.render(JSON.stringify(opt)));

  if (opt.apis) {
    opt.apis.forEach(function(api) {
      readApi(api, function(err) {
        if (err) {
          throw err;
        }
      });
    });
  }

  debug('SWAGGER DESCRIPTOR', prettyjson.render(JSON.stringify(descriptor)));
}

/**
 * Koa middleware
 * @api    public
 * @param  {Object} app
 * @param  {Object} opt
 * @return {Function}
 */
exports.init = function(opt) {


  _debug = (opt && opt.debug);

  // generate resources
  generate(opt);

  var app = koa();

  app.use(function *(next) {
    if (this.path === opt.swaggerURL) { // koa static barfs on root url w/o trailing slash
      this.redirect(this.path + '/');
    } else {
      yield next;
    }
  });

  app.use(mount(opt.swaggerURL, serve(opt.swaggerUI)));

  var swaggerJSON = function *(resourceName) {

    var result = _.clone(descriptor);

    if (resourceName) {
      var resource = resources['/' + resourceName];

      if (!resource) {
        this.status = 404;
        return;
      }

      result.resourcePath = resource.resourcePath;
      result.apis = resource.apis;
      result.models = resource.models;
    } else {

      result.apis = _.map(result.apis, function(api) {
        return {
          path: opt.swaggerJSON + api.resourcePath,
          description: api.description
        };
      });
    }
    debug("RESOURCE : " + (resourceName || '/'), prettyjson.render(result));
    this.body = result;
  };

  var swagger2JSON = function *() {

    var result = _.clone(descriptor);

    result.paths = {};
    result.definitions = {};
    _.map(resources, function(resource) {

      // paths
      var path, verb, i;
      if (resource.apis instanceof Array) {
        for (i = 0; i < resource.apis.length; i++) {
          var api = resource.apis[i];
          for(path in api) {
            if (!result.paths[path]) {
              result.paths[path] = {};
            }
            for(verb in api[path]) {
              if (result.paths[path][verb]) {
                console.error("API " + path + " [" + verb.toUpperCase() + "] is already defined !");
              } else {
                result.paths[path][verb] = api[path][verb];
              }
            }
          }
        }
      } else {
        for (path in resource.apis) {
          if (!result.paths[path]) {
            result.paths[path] = {};
          }
          for(verb in resource.apis[path]) {
            if (result.paths[path][verb]) {
              console.error("API " + path + " [" + verb.toUpperCase() + "] is already defined !");
            } else {
              result.paths[path][verb] = resource.apis[path][verb];
            }
          }
        }
      }

      // definitions
      if (resource.models instanceof Array) {
        for (i = 0; i < resource.models.length; i++) {
          var def = resource.models[i];
          for(var k in def) {
            if (result.paths[k]) {
              console.error("API definition " + k + " is already defined !");
            } else {
              result.paths[k] = def[k];
            }
          }
        }
      } else {
        for (var mk in resource.models) {
          if (result.definitions[mk]) {
            console.error("API definition " + mk + " is already defined !");
          } else {
            result.definitions[mk] = resource.models[mk];
          }
        }
      }
    });
    delete result.apis;

    debug("RESOURCE", prettyjson.render(result));
    this.body = result;
  };

  if (opt._version === 2) {
    app.use(route.get(opt.fullSwaggerJSONPath, swagger2JSON));
  } else {
    app.use(route.get(opt.fullSwaggerJSONPath + '/:resourceName*', swaggerJSON));
  }

  return mount(app, '/');
};

exports.descriptor = descriptor;
exports.resources = resources;
