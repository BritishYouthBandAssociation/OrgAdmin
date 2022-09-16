'use strict';

// Import modules
const express = require('express');
const fs = require('fs');
const Joi = require('joi');
const jimp = require('jimp');
const path = require('path');

const validator = require('@byba/express-validator');

const { helpers: { ConfigHelper } } = require(global.__lib);

const router = express.Router();

const idParamSchema = Joi.object({
	orgID: Joi.number()
		.required()
});

const checkAdmin = (req, res, next) => {
	if (!req.session.user.IsAdmin)
	{return res.redirect('/no-access');}

	next();
};

const checkAccess = (req, res, next) => {
	if (req.params.orgID !== req.session.band?.id && !req.session.user.IsAdmin) {
		return res.redirect('/no-access');
	}

	next();
};

router.get('/', checkAdmin, async (req, res, next) => {
	const orgs = await req.db.Organisation.findAll({
		include: [req.db.OrganisationType]
	});

	return res.render('organisation/index.hbs', {
		title: 'Organisations',
		organisations: orgs
	});
});

router.get('/new', checkAdmin, async (req, res, next) => {
	const types = await req.db.OrganisationType.findAll();

	return res.render('organisation/add.hbs', {
		title: 'Add New Organisation',
		types: types,
		organisation: {}
	});
});

router.post('/new', checkAdmin, validator.query(Joi.object({
	membershipType: Joi.number()
})), validator.body(Joi.object({
	name: Joi.string()
		.required(),
	slug: Joi.string()
		.required(),
	description: Joi.string()
		.required(),
	type: Joi.number()
		.required(),
	lineOne: Joi.string()
		.required(),
	lineTwo: Joi.string()
		.required(),
	city: Joi.string()
		.required(),
	postcode: Joi.string()
		.required(),
})), async (req, res, next) => {
	const org = await req.db.Organisation.create({
		Name: req.body.name,
		Slug: req.body.slug,
		Description: req.body.description,
		OrganisationTypeId: req.body.type,
		Address: {
			Line1: req.body.lineOne,
			Line2: req.body.lineTwo,
			City: req.body.city,
			Postcode: req.body.postcode
		}
	}, {
		include: [req.db.Address]
	});

	if (req.query.membershipType) {
		return res.redirect(`/membership/new?org=${org.id}&type=${req.query.membershipType}`);
	}

	res.redirect(`${org.id}/`);
});

function fileUploaded(base, id, type) {
	const file = path.resolve(base, 'organisations', id, type);
	return fs.existsSync(file);
}

router.get('/:orgID', validator.params(idParamSchema), checkAccess, async (req, res, next) => {
	const [org, types] = await Promise.all([
		req.db.Organisation.findByPk(req.params.orgID, {
			include: [
				req.db.Address,
				req.db.OrganisationType,
				{
					model: req.db.OrganisationUser,
					include: [req.db.User]
				}
			]
		}),
		req.db.OrganisationType.findAll()
	]);

	if (!org) {
		return next();
	}

	const config = ConfigHelper.importJSON(path.join(global.__approot, 'config'), 'server');
	const id = String(org.id);

	const buildFileURL = (filename) => {
		if (!fileUploaded(config.uploadPath, id, `${filename}.png`))
		{return '';}

		let baseURL;
		if (config.serveUploads) {
			const protocol = req.headers.referer.slice(0, req.headers.referer.indexOf('://'));
			const host = req.headers.host;

			baseURL = `${protocol}://${host}/uploads`;
		} else {
			baseURL = config.uploadURL;
		}

		const url = new URL(`${baseURL}/organisations/${id}/${filename}.png`);
		url.searchParams.append('v', new Date().getTime());

		return url;
	};

	return res.render('organisation/view.hbs', {
		title: org.Name,
		organisation: org,
		types: types,
		saved: req.query.saved ?? false,
		logo: buildFileURL('logo'),
		header: buildFileURL('header')
	});
});

router.post('/:orgID', validator.params(idParamSchema), validator.body(Joi.object({
	name: Joi.string()
		.required(),
	slug: Joi.string()
		.required(),
	description: Joi.string()
		.required(),
})), checkAccess, async (req, res, next) => {
	const org = await req.db.Organisation.findByPk(req.params.orgID);

	if (!org) {
		return next();
	}

	try {
		await req.db.sequelize.transaction(async (t) => {
			await org.setOrganisationType(req.body.type, {
				transaction: t
			});

			await req.db.Organisation.update({
				Name: req.body.name,
				Slug: req.body.slug,
				Description: req.body.description,
			}, {
				where: { id: req.params.orgID },
				transaction: t
			});
		});

		// Transaction succeeded and committed
	} catch (e) {
		// Transaction has been rolled back, error in try block
		console.error(e);
	}

	return res.redirect('?saved=true');
});

// TODO validate req.files?
router.post('/:orgID/branding', validator.params(idParamSchema), checkAccess, validator.body(Joi.object({
	primary: Joi.string()
		.regex(/#([\da-fA-F]{3}){1,2}/)
		.required(),
	secondary: Joi.string()
		.regex(/#([\da-fA-F]{3}){1,2}/)
		.required(),
})), async (req, res, next) => {
	const org = await req.db.Organisation.findByPk(req.params.orgID);

	if (!org) {
		return next();
	}

	await org.update({
		PrimaryColour: req.body.primary,
		SecondaryColour: req.body.secondary
	});

	const config = ConfigHelper.importJSON(path.join(global.__approot, 'config'), 'server');
	const uploadBase = path.resolve(config.uploadPath, 'organisations', String(org.id));

	if (!fs.existsSync()) {
		fs.mkdirSync(uploadBase, { recursive: true });
	}

	Object.keys(req.files).forEach(async (f) => {
		const file = req.files[f];
		const newName = `${f}.png`;

		const uploadPath = path.join(uploadBase, newName);

		const img = await jimp.read(file.path);
		await img.writeAsync(uploadPath);
	});

	return res.redirect('./?saved=true');
});

router.post('/:orgID/address', validator.params(idParamSchema), checkAccess, validator.body(Joi.object({
	lineOne: Joi.string()
		.required(),
	lineTwo: Joi.string()
		.required(),
	city: Joi.string()
		.required(),
	postcode: Joi.string()
		.required(),
})), async (req, res, next) => {
	if (req.params.orgID !== req.session.band?.id && !req.session.user.IsAdmin) {
		return res.redirect('/no-access');
	}

	const org = await req.db.Organisation.findByPk(req.params.orgID);

	if (!org) {
		return next();
	}

	const addr = await req.db.Address.create({
		Line1: req.body.lineOne,
		Line2: req.body.lineTwo,
		City: req.body.city,
		Postcode: req.body.postcode
	});
	await org.setAddress(addr);

	res.redirect('./?saved=true');
});

router.get('/:orgID/contacts', validator.params(idParamSchema), checkAccess, validator.query(Joi.object({
	added: Joi.boolean(),
	removed: Joi.boolean()
})), async (req, res, next) => {
	const org = await req.db.Organisation.findByPk(req.params.orgID, {
		include: [{
			model: req.db.OrganisationUser,
			include: [req.db.User]
		}]
	});

	const contacts = org.OrganisationUsers;

	if (!org) {
		return next();
	}

	return res.render('organisation/contacts.hbs', {
		title: `${org.Name} Contact Management`,
		organisation: org,
		contacts: contacts,
		added: req.query.added ?? false,
		removed: req.query.removed ?? false,
		canAdd: contacts.length < 2
	});
});

router.get('/:orgID/contacts/add', validator.params(idParamSchema), checkAccess, validator.query(Joi.object({
	email: Joi.string()
		.email()
		.required()
})), (req, res, next) => {
	return res.redirect(`add/${req.query.email}`);
});

router.get('/:orgID/contacts/add/:email', validator.params(idParamSchema.keys({
	email: Joi.string()
		.email()
		.required()
})), checkAccess, validator.query(Joi.object({
	exists: Joi.boolean()
})), async (req, res, next) => {
	const org = await req.db.Organisation.findByPk(req.params.orgID, {
		include: [req.db.OrganisationType]
	});
	if (!org) {
		return next();
	}

	const user = await req.db.User.findOne({ where: { Email: req.params.email } });
	if (user == null) {
		return res.redirect(`/user/new?orgID=${req.params.orgID}&email=${req.params.email}`);
	}

	return res.render('organisation/add-contact.hbs', {
		title: `Add ${org.Name} Contact`,
		organisation: org,
		contact: user,
		exists: req.query.exists ?? false
	});
});

router.post('/:orgID/contacts/add/:email', validator.params(idParamSchema.keys({
	email: Joi.string()
		.email()
		.required()
})), checkAccess, async (req, res, next) => {
	const org = await req.db.Organisation.findByPk(req.params.orgID);
	if (!org) {
		return next();
	}

	const user = await req.db.User.findOne({ where: { Email: req.params.email } });
	if (!user) {
		return res.redirect(`/user/new?orgID=${req.params.orgID}&email=${req.params.email}`);
	}

	const exists = (await req.db.OrganisationUser.findAndCountAll({
		where: {
			OrganisationId: org.id,
			UserId: user.id
		}
	})).count > 0;

	if (exists) {
		return res.redirect('?exists=true');
	}

	const contact = await req.db.OrganisationUser.build();
	await contact.setOrganisation(org.id);
	await contact.setUser(user.id);
	await contact.save();

	res.redirect('../../contacts?added=true');
});

router.get('/:orgID/contacts/:contactID/remove', validator.params(idParamSchema.keys({
	contactID: Joi.number()
		.required()
})), checkAccess, async (req, res, next) => {
	const contact = await req.db.OrganisationUser.findByPk(req.params.contactID, {
		include: [req.db.Organisation, req.db.User]
	});

	if (!contact) {
		return next();
	}

	return res.render('organisation/remove-contact.hbs', {
		title: `Remove ${contact.Organisation.Name} Contact`,
		organisation: contact.Organisation,
		contact: contact.User
	});
});

router.post('/:orgID/contacts/:contactID/remove', validator.params(idParamSchema.keys({
	contactID: Joi.number()
		.required()
})), checkAccess, async (req, res, next) => {
	const contact = await req.db.OrganisationUser.findByPk(req.params.contactID, {
		include: [req.db.Organisation, req.db.User]
	});

	if (!contact) {
		return next();
	}

	await contact.destroy();

	res.redirect('../../contacts?removed=true');
});

module.exports = {
	root: '/organisation/',
	router: router
};
