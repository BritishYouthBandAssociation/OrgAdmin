'use strict';

// Import modules
const express = require('express');
const router = express.Router();

const path = require('path');
const fs = require('fs');

const jimp = require('jimp');

const {
	helpers: {
		ConfigHelper
	}
} = require(global.__lib);

//list orgs
router.get('/', async (req, res) => {
	if (!req.session.user.IsAdmin) {
		return res.redirect('/no-access');
	}

	const orgs = await req.db.Organisation.findAll({
		include: [ req.db.OrganisationType ]
	});

	return res.render('organisation/index.hbs', {
		title: 'Organisations',
		organisations: orgs
	});
});

//add org
router.get('/new', async (req, res) => {
	if (!req.session.user.IsAdmin) {
		return res.redirect('/no-access');
	}

	const types = await req.db.OrganisationType.findAll();

	return res.render('organisation/add.hbs', {
		title: 'Add New Organisation',
		types: types,
		organisation: {}
	});
});

router.post('/new', async (req, res) => {
	if (!req.session.user.IsAdmin) {
		return res.redirect('/no-access');
	}

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
		include: [ req.db.Address ]
	});

	if (req.query.membershipType != null){
		return res.redirect(`/membership/new?org=${org.id}&type=${req.query.membershipType}`);
	}

	res.redirect(org.id + '/');
});

function fileUploaded(base, id, type){
	const file = path.resolve(base, id, `${type}.png`);
	return fs.existsSync(file);
}

//show org
router.get('/:orgID', async (req, res, next) => {
	if (req.params.orgID !== req.session.band?.id && !req.session.user.IsAdmin){
		return res.redirect('/no-access');
	}

	const [ org, types ] = await Promise.all([
		req.db.Organisation.findByPk(req.params.orgID, {
			include: [
				req.db.Address,
				req.db.OrganisationType,
				{
					model: req.db.OrganisationUser,
					include: [ req.db.User ]
				}
			]
		}),
		req.db.OrganisationType.findAll()
	]);

	if (org == null) {
		return next();
	}

	const config = ConfigHelper.importJSON(path.join(global.__approot, 'config'), 'server');
	const id = String(org.id);

	return res.render('organisation/view.hbs', {
		title: org.Name,
		organisation: org,
		types: types,
		saved: req.query.saved ?? false,
		logo: fileUploaded(config.uploadPath, id, 'logo') ? new URL(`${id}/logo.png`, config.uploadURL) : '',
		header: fileUploaded(config.uploadPath, id, 'header') ? new URL(`${id}/header.png`,config.uploadURL) : ''
	});
});

router.post('/:orgID', async (req, res, next) => {
	if (req.params.orgID !== req.session.band?.id && !req.session.user.IsAdmin){
		return res.redirect('/no-access');
	}

	const org = await req.db.Organisation.findByPk(req.params.orgID);

	if (org == null) {
		return next();
	}

	try {
		await req.db.sequelize.transaction(async (t) => {
			await org.setOrganisationType(req.body.type , {
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

	return res.redirect('?saved=1');
});

router.post('/:orgID/branding', async (req, res, next) => {
	if (req.params.orgID !== req.session.band?.id && !req.session.user.IsAdmin){
		return res.redirect('/no-access');
	}

	const org = await req.db.Organisation.findByPk(req.params.orgID);

	if (org == null) {
		return next();
	}

	await org.update({
		PrimaryColour: req.body.primary,
		SecondaryColour: req.body.secondary
	});

	const config = ConfigHelper.importJSON(path.join(global.__approot, 'config'), 'server');
	const uploadBase = path.resolve(config.uploadPath, String(org.id));

	if (!fs.existsSync()){
		fs.mkdirSync(uploadBase, { recursive: true});
	}

	Object.keys(req.files).forEach(async (f) => {
		const file = req.files[f];
		const newName = `${f}.png`;

		const uploadPath = path.join(uploadBase, newName);

		const img = await jimp.read(file.path);
		await img.writeAsync(uploadPath);
	});

	return res.redirect('./?saved=1');
});

//org contacts
router.get('/:orgID/contacts', async (req, res, next) => {
	if (req.params.orgID !== req.session.band?.id && !req.session.user.IsAdmin){
		return res.redirect('/no-access');
	}

	const org = await req.db.Organisation.findByPk(req.params.orgID, {
		include: [{
			model: req.db.OrganisationUser,
			include: [ req.db.User ]
		}]
	});

	const contacts = org.OrganisationUsers;

	if (org == null) {
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

//add contact
router.get('/:orgID/contacts/add', (req, res, next) => {
	if (req.params.orgID !== req.session.band?.id && !req.session.user.IsAdmin){
		return res.redirect('/no-access');
	}

	if (req.query.email == null) {
		return next();
	}

	return res.redirect(`add/${req.query.email}`);
});

router.get('/:orgID/contacts/add/:email', async (req, res, next) => {
	if (req.params.orgID !== req.session.band?.id && !req.session.user.IsAdmin){
		return res.redirect('/no-access');
	}

	const org = await req.db.Organisation.findByPk(req.params.orgID, {
		include: [ req.db.OrganisationType ]
	});
	if (org == null) {
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

router.post('/:orgID/contacts/add/:email', async (req, res, next) => {
	if (req.params.orgID !== req.session.band?.id && !req.session.user.IsAdmin){
		return res.redirect('/no-access');
	}

	const org = await req.db.Organisation.findByPk(req.params.orgID);
	if (org == null) {
		return next();
	}

	const user = await req.db.User.findOne({ where: { Email: req.params.email } });
	if (user == null) {
		return res.redirect(`/user/new?orgID=${req.params.orgID}&email=${req.params.email}`);
	}

	const exists = await req.db.OrganisationUser.findAndCountAll({
		where: {
			OrganisationId: org.id,
			UserId: user.id
		}
	}) > 0;

	if (exists){
		return res.redirect('?exists=1');
	}

	const contact = await req.db.OrganisationUser.build();
	await contact.setOrganisation(org.id);
	await contact.setUser(user.id);
	await contact.save();

	res.redirect('../../contacts?added=1');
});

//remove contact
router.get('/:orgID/contacts/:contactID/remove', async (req, res, next) => {
	if (req.params.orgID !== req.session.band?.id && !req.session.user.IsAdmin){
		return res.redirect('/no-access');
	}

	const contact = await req.db.OrganisationUser.findByPk(req.params.contactID, {
		include: [ req.db.Organisation, req.db.User ]
	});

	if (contact == null) {
		return next();
	}

	return res.render('organisation/remove-contact.hbs', {
		title: `Remove ${contact.Organisation.Name} Contact`,
		organisation: contact.Organisation,
		contact: contact.User
	});
});

router.post('/:orgID/contacts/:contactID/remove', async (req, res, next) => {
	if (req.params.orgID !== req.session.band?.id && !req.session.user.IsAdmin){
		return res.redirect('/no-access');
	}

	const contact = await req.db.OrganisationUser.findByPk(req.params.contactID, {
		include: [ req.db.Organisation, req.db.User ]
	});

	if (contact == null) {
		return next();
	}

	await contact.destroy();

	res.redirect('../../contacts?removed=1');
});

module.exports = {
	root: '/organisation/',
	router: router
};
