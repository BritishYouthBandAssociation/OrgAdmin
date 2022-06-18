'use strict';

// Import modules
const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
	const memberships = await req.db.Membership.findAll({
		where: { Season: 2022 },
		include: [
			req.db.Label,
			req.db.MembershipType,
			{
				model: req.db.IndividualMembership,
				include: [ req.db.User ]
			},
			{
				model: req.db.OrganisationMembership,
				include: [ req.db.Organisation ]
			}
		]
	});

	const labels = await req.db.Label.findAll({
		where: { '$Memberships.Season$': 2022 },
		include: [ req.db.Membership ],
		order: [ [ 'Name', 'ASC' ] ]
	});

	return res.render('membership/index.hbs', {
		title: "Membership",
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

	res.render('membership/add.hbs', {
		title: "Add Membership",
		types: types
	});
});

router.post('/new', async (req, res) => {
	const type = await req.db.MembershipType.findOne({
		where: {
			id: req.body.type
		}
	});

	if (type == null){
		return res.redirect("");
	}

	if (type.IsOrganisation){
		if (req.body.organisation === '-1'){
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

		if (exists != null){
			//if this band already has a membership this season, display it
			return res.redirect(exists.id);
		}

		//create the membership
		const membership = await req.db.Membership.create({
			Season: req.body.season,
			Cost: type.Cost,
			MembershipTypeId: req.body.type
		});

		//add the band to the membership
		await req.db.OrganisationMembership.create({
			OrganisationId: req.body.organisation,
			MembershipId: membership.id
		});

		//oh and add a label for the type!
		await req.db.MembershipLabel.create({
			MembershipId: membership.id,
			LabelId: type.LabelId
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

	if (!exists){
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

	if (eMemb !== null){
		return res.redirect(eMemb.id);
	}

	//create the membership
	const membership = await req.db.Membership.create({
		Season: req.body.season,
		Cost: type.Cost,
		MembershipTypeId: req.body.type
	});

	//add the individual to the membership
	await req.db.IndividualMembership.create({
		UserId: exists.id,
		MembershipId: membership.id
	});

	//oh and add a label for the type!
	await req.db.MembershipLabel.create({
		MembershipId: membership.id,
		LabelId: type.LabelId
	});

	//display it
	return res.redirect(membership.id);
});

router.get('/:id', async (req, res, next) => {
	const membership = await req.db.Membership.findByPk(req.params.id, {
		include: [
			req.db.Label,
			req.db.MembershipType,
			{
				model: req.db.IndividualMembership,
				include: [ req.db.User ]
			},
			{
				model: req.db.OrganisationMembership,
				include: {
					model: req.db.Organisation,
					include: [ req.db.OrganisationType ]
				}
			}
		]
	});

	if (membership == null){
		return next();
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
