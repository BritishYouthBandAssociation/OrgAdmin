'use strict';

// Import modules
const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
	if (!req.session.user.IsAdmin) {
		return res.redirect('/no-access');
	}

	const memberships = await req.db.Membership.findAll({
		where: { Season: 2022 },
		include: [
			req.db.Label,
			req.db.MembershipType,
			{
				model: req.db.IndividualMembership,
				include: [req.db.User]
			},
			{
				model: req.db.OrganisationMembership,
				include: [req.db.Organisation]
			}
		]
	});

	const labels = await req.db.Label.findAll({
		where: { '$Memberships.Season$': 2022 },
		include: [req.db.Membership],
		order: [['Name', 'ASC']]
	});

	return res.render('membership/index.hbs', {
		title: 'Membership',
		seasons: [2022],
		season: 2022,
		membership: memberships,
		filters: labels
	});
});

router.get('/new', async (req, res) => {
	const types = await req.db.MembershipType.findAll({
		where: {
			IsActive: true
		}
	});

	let member = null;
	if (req.query.org != null) {
		member = await req.db.Organisation.findByPk(req.query.org);
	}

	res.render('membership/add.hbs', {
		title: 'Add Membership',
		types: types,
		type: req.query.type ?? '',
		email: req.query.email ?? '',
		member: member
	});
});

router.post('/new', async (req, res) => {
	const type = await req.db.MembershipType.findOne({
		where: {
			id: req.body.type
		}
	});

	if (type == null) {
		return res.redirect('');
	}

	if (type.IsOrganisation) {
		if (req.body.notFound === 'true') {
			return res.redirect(`/organisation/new?membershipType=${req.body.type}`);
		}

		const exists = await req.db.Membership.findOne({
			where: {
				Season: req.body.season,
			},
			include: [{
				model: req.db.OrganisationMembership,
				where: {
					OrganisationId: req.body.organisation
				},
				required: true
			}]
		});

		if (exists != null) {
			//if this band already has a membership this season, display it
			return res.redirect(exists.id);
		}

		//create the membership
		const membership = await req.db.Membership.create({
			Season: req.body.season,
			MembershipTypeId: req.body.type
		});

		//add the band to the membership
		await req.db.OrganisationMembership.create({
			OrganisationId: req.body.organisation,
			MembershipId: membership.id
		});

		//display it
		return res.redirect(membership.id);
	}

	//we have an individual membership here
	const exists = await req.db.User.findOne({
		where: {
			Email: req.body.email
		}
	});

	if (!exists) {
		//if not a current user, make them create one first
		return res.redirect(`/user/new?email=${req.body.email}&membership=${type.id}`);
	}

	//do they already have a membership for this season?
	const eMemb = await req.db.Membership.findOne({
		where: {
			Season: req.body.season,
		},
		include: [{
			model: req.db.IndividualMembership,
			where: {
				UserId: exists.id
			},
			required: true
		}]
	});

	if (eMemb !== null) {
		return res.redirect(eMemb.id);
	}

	//create the membership
	const membership = await req.db.Membership.create({
		Season: req.body.season,
		MembershipTypeId: req.body.type
	});

	//add the individual to the membership
	await req.db.IndividualMembership.create({
		UserId: exists.id,
		MembershipId: membership.id
	});

	//display it
	return res.redirect(membership.id);
});

router.get('/:id', async (req, res, next) => {
	const [membership, paymentTypes] = await Promise.all([req.db.Membership.findByPk(req.params.id, {
		include: [
			req.db.Label,
			req.db.MembershipType,
			req.db.Fee,
			{
				model: req.db.IndividualMembership,
				include: [req.db.User]
			},
			{
				model: req.db.OrganisationMembership,
				include: {
					model: req.db.Organisation,
					include: [req.db.OrganisationType]
				}
			}
		]
	}),
	req.db.PaymentType.findAll({
		where: {
			IsActive: true
		}
	})]);

	if (!membership) {
		return next();
	}

	if (!req.session.user.IsAdmin) {
		if (membership.MembershipType.IsOrganisation) {
			if (membership.Entity.id !== req.session.band?.id) {
				return res.redirect('/no-access');
			}
		} else if (membership.Entity.Email !== req.session.user.Email) {
			return res.redirect('/no-access');
		}
	}

	return res.render('membership/view.hbs', {
		title: `Membership ${membership.Number}`,
		membership: membership,
		entity: membership.Entity,
		paymentTypes: paymentTypes,
		saved: req.query.saved ?? false
	});
});

module.exports = {
	root: '/membership/',
	router: router
};
