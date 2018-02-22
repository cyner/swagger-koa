/**
 * Module dependencies.
 */

var koa = require('koa')
  , router = require('koa-route')
  , views = require('koa-render')
  , serve = require('koa-static')
  , api = require('./api2')
  , path = require('path')
  , swagger = require('../');

var app = koa(),
    port = 3000;

app.use(views('views', { default: 'jade' }));

app.use(swagger.init({
  debug: true,

  swaggerURL: '/swagger',
  swaggerJSON: '/api/v1/docs.json',
  swaggerUI: './public/swagger2/',

  descriptor: {
    "swagger": "2.0",
    "info": {
        "title": "Your API",
        "description": "All About API",
        "version": "0.1.0"
    },
    "host": "localhost:3000",
    "schemes": [
        "http"
    ],
    "basePath": "/",
    "produces": [
        "application/json"
    ],
  },

  apis: ['./api2.js', './api2.yml', './common.yml']
}));

app.use(serve(path.join(__dirname, 'public')));

app.use(router.get('/', function *() {
  this.body = yield this.render('index', { title: 'Koa' });
}));

app.use(router.get('/login', api.login));
app.use(router.post('/user', api.createUser));

app.listen(port, function() {
  console.log('Server running on port ' + port);
});
