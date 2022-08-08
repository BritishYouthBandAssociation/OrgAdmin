'use strict';

const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
	if (!req.session.user.IsAdmin) {
		return res.redirect("/no-access");
	}

	const types = await req.db.MembershipType.findAll({
		where: {
			IsActive: true
		}
	});

	return res.render('email/index.hbs', {
		title: 'Bulk Emailer',
		types: types,
		season: 2022
	});
});

router.post('/test', async (req, res) => {
	if (!req.session.user.IsAdmin) {
		return res.redirect("/no-access");
	}

	const t = await req.db.sequelize.transaction();
	const msg = await req.db.Message.create({
		Sender: req.body.sender,
		Subject: req.body.subject,
		Body: req.body.message.replaceAll('${firstName}', req.session.user.FirstName).replaceAll('${lastName}', req.session.user.Surname).replaceAll('${bandName}', req.session.band?.Name ?? 'your band')
	}, {
		transaction: t
	});

	await req.db.Recipient.create({
		Name: `${req.session.user.FirstName} ${req.session.user.Surname}`,
		EmailAddress: req.session.user.Email,
		MessageId: msg.id
	}, {
		transaction: t
	});

	await t.commit();

	const types = await req.db.MembershipType.findAll({
		where: {
			IsActive: true
		}
	});

	return res.render('email/index.hbs', {
		title: 'Bulk Emailer',
		types: types,
		season: 2022,
		subject: req.body.subject,
		message: req.body.message,
		success: true
	});
});

router.post('/send', (req, res) => {
	if (!req.session.user.IsAdmin) {
		return res.redirect("/no-access");
	}

	//let recipients = [];

	// if (req.query.test) {
	// 	recipients = [{
	// 		Name: `${req.session.user.FirstName} ${req.session.user.Surname}`,
	// 		EmailAddress: req.session.user.Email,
	// 		MessageId: msg.id
	// 	}];
	// } else {
	// 	recipients = (await Promise.all(req.body.membership.map(async m => {
	// 		const member = await req.db.Membership.findByPk(m, {
	// 			include: {
	// 				all: true,
	// 				nested: true
	// 			}
	// 		});

	// 		const contacts = member.OrganisationMembership?.Organisation?.OrganisationUsers ?? [member.IndividualMembership];

	// 		return contacts.map(c => {
	// 			//console.log(c.dataValues);

	// 			return {
	// 				Name: `${c.User.FirstName} ${c.User.Surname}`,
	// 				EmailAddress: c.User.Email,
	// 				MessageId: msg.id
	// 			}
	// 		});
	// 	}))).flat();
	// }

	return res.redirect('./');
});

module.exports = {
	root: '/email',
	router: router
};