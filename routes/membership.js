'use strict';

// Import modules
const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
	if (!req.session.user.IsAdmin) {
		return res.redirect("/no-access");
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
		title: "Membership",
		seasons: [2022],
		season: 2022,
		membership: memberships,
		filters: labels
	});
});

router.get('/new', (req, res) => {
	res.render('membership/add.hbs', {
		title: "Add Membership"
	});
});

router.get('/:id', async (req, res, next) => {
	const membership = await req.db.Membership.findByPk(req.params.id, {
		include: [
			req.db.Label,
			req.db.MembershipType,
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
	});

	if (membership == null) {
		return next();
	}

	if (!req.session.user.IsAdmin) {
		if (membership.MembershipType.IsOrganisation) {
			if (membership.Entity.id !== req.session.band?.id) {
				return res.redirect("/no-access");
			}
		} else if (membership.Entity.Email !== req.session.user.Email) {
			return res.redirect("/no-access");
		}
	}

	return res.render("membership/view.hbs", {
		title: `Membership ${membership.Number}`,
		membership: membership,
		entity: membership.Entity
	});
});

module.exports = {
	root: '/membership/',
	router: router
};
