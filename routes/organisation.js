'use strict';

// Import modules
const express = require('express');
const Joi = require('joi');
const path = require('path');

const validator = require('@byba/express-validator');

const { helpers: { ConfigHelper, StringHelper } } = require(global.__lib);

const router = express.Router();

const idParamSchema = Joi.object({
	orgID: Joi.number()
		.required()
});

const { checkAdmin, matchingID } = require('../middleware');

async function getImageToken(config) {
	try {
		const details = await fetch(`${config.uploadServer}upload/token`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Origin': 'localhost'
			},
			body: JSON.stringify({ secret: config.uploadSecret })
		}).then(res => res.json());

		return details.Value;
	} catch {
		console.error('File uploads are currently unavailable - it looks like Presto is not running!');
		return null;
	}
}

async function commitImage(config, data, origin, token = null, isRetry = false) {
	if (!token) {
		token = await getImageToken(config);
	}

	const details = await fetch(`${config.uploadServer}${data.id}/commit`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Origin': origin,
			'Authorization': `Bearer ${token}`
		},
		body: JSON.stringify(data)
	}).then(res => res.json());

	if (details.IsError && !isRetry) {
		await commitImage(config, data, origin, null, true);
	}
}

async function removeImage(config, id, origin, token = null) {
	if (!token) {
		token = await getImageToken(config);
	}

	const details = await fetch(`${config.uploadServer}${id}`, {
		method: 'DELETE',
		headers: {
			'Content-Type': 'application/json',
			'Origin': origin,
			'Authorization': `Bearer ${token}`
		}
	}).then(res => res.json());
}

router.get('/', checkAdmin, async (req, res, next) => {
	const orgs = await req.db.Organisation.findAll({
		include: [req.db.OrganisationType],
		order: [
			['Name']
		]
	});

	return res.render('organisation/index.hbs', {
		title: 'Organisations',
		organisations: orgs
	});
});

router.get('/new', async (req, res) => {
	const config = ConfigHelper.importJSON(path.join(global.__approot, 'config'), 'server');
	const [types, uploadToken, membership] = await Promise.all([req.db.OrganisationType.getActive(), getImageToken(config), req.db.MembershipType.getActive({
		IsOrganisation: true
	})]);

	const hbParams = {
		title: 'Add New Organisation',
		types: types,
		uploadToken,
		name: req.query.name ?? '',
		type: req.query.membershipType ?? '',
		membership
	};

	if (!req.session.user) {
		hbParams.layout = 'no-nav.hbs';
		hbParams.background = '/assets/field-markings.jpg';
		hbParams.darkenBG = true;
	}

	return res.render('organisation/add.hbs', hbParams);
});

router.post('/new', validator.query(Joi.object({
	eventId: Joi.string()
		.guid(),
	name: Joi.string().optional().allow('', null) //does nothing but may be carried over from get
})), validator.body(Joi.object({
	name: Joi.string(),
	type: Joi.number(),
	logo: Joi.string().optional().allow('', null),
	description: Joi.string().optional().allow('', null),
	header: Joi.string().optional().allow('', null),
	primary: Joi.string(),
	secondary: Joi.string(),
	'primary-fname': Joi.string(),
	'primary-sname': Joi.string(),
	'primary-email': Joi.string().email(),
	'primary-address-lineOne': Joi.string().optional().allow('', null),
	'primary-address-lineTwo': Joi.string().optional().allow('', null),
	'primary-address-city': Joi.string().optional().allow('', null),
	'primary-address-postcode': Joi.string().optional().allow('', null),
	'secondary-fname': Joi.string().optional().allow('', null),
	'secondary-sname': Joi.string().optional().allow('', null),
	'secondary-email': Joi.string().optional().allow('', null),
	'organisation-lineOne': Joi.string().optional().allow('', null),
	'organisation-lineTwo': Joi.string().optional().allow('', null),
	'organisation-city': Joi.string().optional().allow('', null),
	'organisation-postcode': Joi.string().optional().allow('', null),
	membership: Joi.number()
})), async (req, res) => {
	const slug = StringHelper.formatSlug(req.body.name);
	let org = await req.db.Organisation.findBySlug(slug);

	if (org){
		return res.redirect(`/organisation/registration/?org=${org.id}&duplicate=true`);
	}

	let primaryCreated = false;

	await req.db.sequelize.transaction(async (transaction) => {
		org = await req.db.Organisation.create({
			Name: req.body.name,
			Slug: slug,
			Description: req.body.description,
			OrganisationTypeId: req.body.type,
			PrimaryColour: req.body.primary,
			SecondaryColour: req.body.secondary,
			LogoId: req.body.logo,
			HeaderId: req.body.header,
			IsPending: !(req.session.user && req.session.user.IsAdmin)
		}, {
			transaction
		});

		let [primary, secondary] = await Promise.all([
			req.db.User.insertOrUpdate({
				FirstName: req.body['primary-fname'],
				Surname: req.body['primary-sname'],
				Email: req.body['primary-email']
			}, {
				transaction
			}),
			(async function() {
				if (req.body['secondary-fname'].trim() == '') {
					return null;
				}

				await req.db.User.insertOrUpdate({
					FirstName: req.body['secondary-fname'],
					Surname: req.body['secondary-sname'],
					Email: req.body['secondary-email']
				}, {
					transaction
				});
			})(),
			(async function() {
				if (req.body['organisation-lineOne'].trim() != '') {
					await req.db.Address.createAssignedOrUpdate({
						Line1: req.body['organisation-lineOne'],
						Line2: req.body['organisation-lineTwo'],
						City: req.body['organisation-city'],
						Postcode: req.body['organisation-postcode']
					}, org, {
						transaction
					});
				}
			})(),
			org.createMembership(req.body.membership, null, {transaction})
		]);

		[primary, primaryCreated] = primary;

		if (secondary){
			secondary = secondary[0];
		}

		await Promise.all([primary, secondary].map(u => {
			return (async function(){
				if (!u){
					return;
				}

				console.log();
				console.log(u);
				console.log();

				await req.db.OrganisationUser.create({
					OrganisationId: org.id,
					UserId: u.id
				}, {transaction});
			})();
		}));

		if (req.body['primary-address-lineOne'].trim() != '') {
			await req.db.Address.createAssignedOrUpdate({
				Line1: req.body['primary-address-lineOne'],
				Line2: req.body['primary-address-lineTwo'],
				City: req.body['primary-address-city'],
				Postcode: req.body['primary-address-postcode']
			}, primary, {
				transaction
			});
		}
	});

	if (!req.session.user){
		return res.redirect(`/organisation/registration/?org=${org.id}&newAccount=${primaryCreated}`);
	}

	if (req.query.eventId) {
		return res.redirect(`/event/${req.query.eventId}/organisations/?org=${org.id}`);
	}

	res.redirect(`${org.id}/`);
});

router.get('/registration/', validator.query(Joi.object({
	org: Joi.number(),
	newAccount: Joi.boolean(),
	duplicate: Joi.boolean().optional().falsy(null)
})), async (req, res, next) => {
	if (req.session.user){
		return res.redirect(`/organisation/${req.query.org}/`);
	}

	const org = await req.db.Organisation.findByPk(req.query.org, {
		include: [{
			model: req.db.OrganisationMembership,
			include: [{
				model: req.db.Membership,
				include: [req.db.Fee]
			}]
		}]
	});
	if (!org){
		return next();
	}

	res.render('organisation/registered.hbs', {
		layout: 'no-nav.hbs',
		title: 'Registration Complete',
		background: '/assets/field-markings.jpg',
		darkenBG: true,
		org,
		fee: org.OrganisationMemberships[0].Membership.Fee.Total,
		duplicate: req.query.duplicate
	});
});

router.get('/:orgID', validator.params(idParamSchema), matchingID('orgID', ['band', 'id']), validator.query(Joi.object({
	saved: Joi.boolean(),
	error: [Joi.boolean(), Joi.string()],
})), async (req, res, next) => {
	const [org, types] = await Promise.all([
		req.db.Organisation.findByPk(req.params.orgID, {
			include: [
				req.db.Address,
				req.db.OrganisationType,
				{
					model: req.db.OrganisationUser,
					include: [req.db.User]
				},
				{
					model: req.db.OrgChangeRequest,
					where: {
						IsApproved: null
					},
					required: false
				}
			]
		}),
		req.db.OrganisationType.getActive()
	]);

	if (!org) {
		return next();
	}

	if (typeof req.query.error === 'string') {
		req.query.error = decodeURIComponent(req.query.error);
	} else if (typeof req.query.error === 'boolean') {
		req.query.error = 'An error has occurred while saving, please check the details and try again';
	}

	const config = ConfigHelper.importJSON(path.join(global.__approot, 'config'), 'server');
	const token = await getImageToken(config);

	return res.render('organisation/view.hbs', {
		title: org.Name,
		organisation: org,
		types: types,
		saved: req.query.saved ?? false,
		error: req.query.error ?? false,
		enableUpload: config.uploadPath != null,
		uploadToken: token
	});
});

//TODO: allow colours to be rgb() as well as hex
router.post('/:orgID', validator.params(idParamSchema), validator.body(Joi.object({
	name: Joi.string()
		.required(),
	slug: Joi.string()
		.required(),
	description: Joi.string()
		.required(),
	primary: Joi.string()
		.regex(/#([\da-fA-F]{3}){1,2}/)
		.required(),
	secondary: Joi.string()
		.regex(/#([\da-fA-F]{3}){1,2}/)
		.required(),
	logo: Joi.string().guid().allow(''),
	header: Joi.string().guid().allow('')
})), matchingID('orgID', ['band', 'id']), async (req, res, next) => {
	const org = await req.db.Organisation.findByPk(req.params.orgID);

	if (!org) {
		return next();
	}

	const changeRequests = [];
	if (org.Name != req.body.name) {
		changeRequests.push({
			Field: 'Name',
			OldValue: org.Name,
			NewValue: req.body.name
		});
	}

	if (org.Description.replaceAll(/\s/g, '').toLowerCase() != req.body.description.replaceAll(/\s/g, '').toLowerCase()) {
		changeRequests.push({
			Field: 'Description',
			OldValue: org.Description,
			NewValue: req.body.description
		});
	}

	if (req.body.logo && req.body.logo != org.LogoId) {
		changeRequests.push({
			Field: 'LogoId',
			OldValue: org.LogoId,
			NewValue: req.body.logo
		});
	}

	if (req.body.header && req.body.header != org.HeaderId) {
		changeRequests.push({
			Field: 'HeaderId',
			OldValue: org.HeaderId,
			NewValue: req.body.header
		});
	}

	if (req.session.user.IsAdmin) {
		org.Name = req.body.name;
		org.Slug = req.body.slug;
		org.Description = req.body.description;
		org.LogoId = req.body.logo;
		org.HeaderId = req.body.header;
	}

	org.PrimaryColour = req.body.primary;
	org.SecondaryColour = req.body.secondary;

	let token = null;
	const origin = req.headers.host;
	const config = ConfigHelper.importJSON(path.join(global.__approot, 'config'), 'server');

	const basePath = `org/${org.id}/`;
	const logoPath = basePath + (req.session.user.IsAdmin ? 'logo' : 'logo-request');
	const headerPath = basePath + (req.session.user.IsAdmin ? 'header' : 'header-request');

	if (req.body.logo && req.body.logo != org.LogoId) {
		token = await getImageToken(config);

		await removeImage(config, logoPath, origin, token);
		await commitImage(config, {
			id: req.body.logo,
			path: logoPath
		}, origin, token);
	}

	if (req.body.header && req.body.header != org.HeaderId) {
		if (!token) {
			token = await getImageToken(config);
		}

		await removeImage(config, headerPath, origin, token);
		await commitImage(config, {
			id: req.body.header,
			path: headerPath
		}, origin, token);
	}

	await org.save();


	await Promise.all(changeRequests.map((cr) => {
		return org.createOrgChangeRequest({
			...cr,
			RequesterId: req.session.user.id,
			IsApproved: req.session.user.IsAdmin ? true : null,
			ApproverId: req.session.user.IsAdmin ? req.session.user.id : null
		});
	}));

	return res.redirect('?saved=true');
});

router.post('/:orgID/address', validator.params(idParamSchema), matchingID('orgID', ['band', 'id']), validator.body(Joi.object({
	lineOne: Joi.string()
		.required(),
	lineTwo: Joi.string()
		.required(),
	city: Joi.string()
		.required(),
	postcode: Joi.string()
		.required(),
})), async (req, res, next) => {
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

router.get('/:orgID/changes', validator.params(idParamSchema), matchingID('orgID', ['band', 'id']), async (req, res, next) => {
	const org = await req.db.Organisation.findByPk(req.params.orgID, {
		include: [{
			model: req.db.OrgChangeRequest,
			include: ['Requester'],
			where: {
				IsApproved: null,
			},
			required: false
		}]
	});

	if (!org) {
		return next();
	}

	res.render('organisation/changes.hbs', {
		title: `Change Requests for ${org.Name}`,
		organisation: org
	});
});

router.post('/:orgID/changes/:changeID', validator.params(Joi.object({
	orgID: Joi.number()
		.required(),
	changeID: Joi.number()
		.required()
})), validator.body(Joi.object({
	approve: Joi.boolean()
		.required()
})), matchingID('orgID', ['band', 'id']), async (req, res, next) => {
	const [org, change] = await Promise.all([req.db.Organisation.findByPk(req.params.orgID), req.db.OrgChangeRequest.findByPk(req.params.changeID)]);

	if (!org || !change || change.IsApproved) {
		return next();
	}

	change.IsApproved = req.body.approve;
	change.setApprover(req.session.user);

	if (change.IsApproved) {
		org[change.Field] = change.NewValue;
	}

	await Promise.all([change.save(), org.save()]);

	res.redirect('../changes?saved=true');
});

router.get('/:orgID/contacts', validator.params(idParamSchema), matchingID('orgID', ['band', 'id']), validator.query(Joi.object({
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

router.get('/:orgID/contacts/add', validator.params(idParamSchema), matchingID('orgID', ['band', 'id']), validator.query(Joi.object({
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
})), matchingID('orgID', ['band', 'id']), validator.query(Joi.object({
	exists: Joi.boolean()
})), async (req, res, next) => {
	const org = await req.db.Organisation.findByPk(req.params.orgID, {
		include: [req.db.OrganisationType]
	});
	if (!org) {
		return next();
	}

	const user = await req.db.User.findByEmail(req.params.email);
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
})), matchingID('orgID', ['band', 'id']), async (req, res, next) => {
	const org = await req.db.Organisation.findByPk(req.params.orgID);
	if (!org) {
		return next();
	}

	const user = await req.db.User.findByEmail(req.params.email);
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
})), matchingID('orgID', ['band', 'id']), async (req, res, next) => {
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
})), matchingID('orgID', ['band', 'id']), async (req, res, next) => {
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
