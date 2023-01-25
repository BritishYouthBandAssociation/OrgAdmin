'use strict';

// Import modules
const path = require('path');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);

// Initialise library path
const libPath = path.join(__dirname, process.env.LIB_PATH ?? '../Library');
global.__lib = libPath;

// Import library functions
const {
	helpers: {
		ConfigHelper,
	},
	Server
} = require(libPath);

//set global base dir
global.__approot = __dirname;

async function main() {
	// Initialise express app
	const app = Server({
		dir: __dirname
	});

	// Import configuration
	const serverOptions = ConfigHelper.importJSON(path.join(__dirname, 'config'), 'server');

	// Add logging middleware
	if (serverOptions.logging) {
		app.enableLogging('tiny', (req) => /(^\/(js|css|fonts|assets|favicon)|(png|jpg|css))/.test(req.path));
	}

	// Set up handlebars templating engine
	app.useHandlebars('hbs', {
		extname: '.hbs',
		runtimeOptions: {
			allowProtoPropertiesByDefault: true,
			allowProtoMethodsByDefault: true
		}
	});

	// Serve the production vue script if in production environment
	app.get('/js/vue.js', (req, res, next) => {
		if (process.env.NODE_ENV === 'production') {
			return res.redirect('/js/vue.min.js');
		}

		next();
	});

	app.addStaticDir(path.join(__dirname, 'public'));

	// Get database models and connection
	const dbPath = path.join(libPath, 'models');
	const db = await require(dbPath)(path.join(__dirname, 'config/db'));
	app.registerGlobals({db});

	//... and use it for our session stuff too!
	const sessionStore = new SequelizeStore({ db: db.sequelize });
	await sessionStore.sync();

	const sessionConfig = ConfigHelper.importJSON(path.join(__dirname, 'config'), 'session');
	sessionConfig.store = sessionStore;

	app.use(session(sessionConfig));

	//prevent unauthorised access
	app.use(async (req, res, next) => {
		//allow css/css.map/js files
		if (/\.(css|js|css\.map)$/.test(req.path)) {
			return next();
		}

		if (!req.session.user) {
			if (!serverOptions.noAuthRequired.includes(req.path)) {
				return res.redirect(`/?next=${req.path}`);
			}
		} else {
			req.session.user = await req.db.User.findByPk(req.session.user.id);

			req.session.user.bands = await req.db.Organisation.findAll({
				include: [{
					model: req.db.OrganisationUser,
					where: {
						UserId: req.session.user.id
					},
					attributes: []
				}],
				where: {
					OrganisationTypeId: 1 //we only want associated bands here
				}
			});

			if (!req.session.user.bands.some(b => b.id === req.session.band?.id)) {
				req.session.band = null;
			}

			if (!req.session.band) {
				if (req.session.user.bands.length > 0) {
					req.session.band = req.session.user.bands[0];
				}
			}

			const resetPath = `/password-reset/${req.session.user.id}`;
			const resetAllowedPaths = /^\/(logout$|user\/.*\/password)/;
			if (req.session.user.ForcePasswordReset && !req.path.startsWith(resetPath) && !resetAllowedPaths.test(req.path)){
				res.redirect(resetPath);
				return;
			}
		}

		next();
	});

	//init locals (for Handlebars)
	app.use((req, res, next) => {
		res.locals.page = req.path.toLowerCase();
		res.locals.session = req.session;
		res.locals.uploadServer = serverOptions.uploadServer;

		next();
	});

	app.loadRoutes();

	/*
	 * If the request gets to the bottom of the route stack, it doesn't
	 * have a defined route and therefore a HTTP status code 404 is sent
	 * and an error page shown
	 */
	app.use((_, res) => {
		res.status(404).render('error', {
			title: 'Error',
			code: 404,
			msg: 'Page Not Found'
		});
	});

	// Start the server
	app.listen(serverOptions.port, () => {
		console.log(`Server listening on :${serverOptions.port}`);
	});
}

main();
