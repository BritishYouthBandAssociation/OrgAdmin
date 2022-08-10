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
		season: 2022,
		success: req.query.success ?? false
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
		Body: req.body.message.replaceAll('{firstName}', req.session.user.FirstName).replaceAll('{lastName}', req.session.user.Surname).replaceAll('{bandName}', req.session.band?.Name ?? 'your band')
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

router.post('/send', async (req, res) => {
	if (!req.session.user.IsAdmin) {
		return res.redirect("/no-access");
	}

	const t = await req.db.sequelize.transaction();

	try {
		await Promise.all(req.body.membership.map(async m => {
			const member = await req.db.Membership.findByPk(m, {
				include: {
					all: true,
					nested: true
				}
			});

			const contacts = member.OrganisationMembership?.Organisation?.OrganisationUsers
				?? [member.IndividualMembership];

			return Promise.all(contacts.map(async c => {
				const msg = await req.db.Message.create({
					Sender: req.body.sender,
					Subject: req.body.subject,
					Body: req.body.message.replaceAll('{firstName}', c.User.FirstName).replaceAll('{lastName}', c.User.Surname).replaceAll('{bandName}', member.OrganisationMembership?.Organisation?.Name ?? '')
				}, {
					transaction: t
				});

				await req.db.Recipient.create({
					Name: `${c.User.FirstName} ${c.User.Surname}`,
					EmailAddress: c.User.Email,
					MessageId: msg.id
				}, {
					transaction: t
				});
			}));
		}));

		t.commit();

		res.redirect('./?success=1');
	} catch (ex) {
		t.rollback();

		const types = await req.db.MembershipType.findAll({
			where: {
				IsActive: true
			}
		});

		res.render('email/index.hbs', {
			title: 'Bulk Emailer',
			types: types,
			season: 2022,
			subject: req.body.subject,
			message: req.body.message,
			error: true
		});
	}
});

module.exports = {
	root: '/email',
	router: router
};