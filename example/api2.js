
/**
 * @swagger
 * resourcePath: /apiJs
 * description: All about API
 */

 /**
  * @swagger
  * /login:
  *   get:
  *     summary: Login with username and password
  *     description: Returns a user based on username
  *     tags:
  *       - Auth Api
  *
  *     parameters:
  *       - name: username
  *         in: query
  *         description: Your username
  *         required: true
  *         type: string
  *       - name: password
  *         in: query
  *         description: Your password
  *         required: true
  *         type: string
  *
  *     responses:
  *       '200':
  *         description: return a user object
  *         schema:
  *           $ref: '#/definitions/User'
  *
  */

exports.login = function *() {
  var user = {}
    , query = this.request.query;

    console.log(this.request);
  user.username = query.username;
  user.password = query.password;

  this.body = user;
};

/**
 * @swagger
 * /user:
 *   post:
 *     summary: Create a new user
 *     description: Returns created user id
 *     tags:
 *       - User Api
 *
 *     parameters:
 *       - name: username
 *         in: path
 *         description: Your username
 *         required: true
 *         type: string
 *       - name: password
 *         in: path
 *         description: Your password
 *         required: true
 *         type: string
 *
 *     responses:
 *       '200':
 *         description: return a new user id
 *         schema:
 *           properties:
 *             id:
 *               type: integer
 *               description": User id
 *
 */

exports.createUser = function *() {
 this.body = {id: 1};
};
