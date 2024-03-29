'use strict';

const {
	helpers: {
		StringHelper
	},
	constants
} = require(global.__lib);

const {Op} = require('sequelize');

class WPOrderProcessor {
	#products = [];
	#season = null;
	#db = null;

	constructor(products, season, db) {
		this.#products = products;
		this.#season = season;
		this.#db = db;
	}

	async getContact(order) {
		const contact = {
			Email: order.billing.email,
			FirstName: StringHelper.toTitleCase(order.billing.first_name),
			Surname: StringHelper.toTitleCase(order.billing.last_name),
			IsActive: true,
			IsAdmin: false,
			Password: `BYBA@${this.#season.Identifier}`
		};

		let contactMatch = await this.#db.User.findOne({
			where: {
				Email: contact.Email
			}
		});

		if (contactMatch) {
			Object.keys(contact).filter(f => !['IsActive', 'IsAdmin', 'Password'].includes(f)).forEach(c => {
				contactMatch[c] = contact[c];
			});
			await contactMatch.save();
		} else {
			contactMatch = await this.#db.User.create(contact);
		}

		return contactMatch;
	}

	async getOrganisation(orgName) {
		const slug = StringHelper.formatSlug(orgName);
		const org = {
			Name: StringHelper.toTitleCase(orgName),
			Slug: slug,
			Description: '',
			OrganisationTypeId: constants.ORGANISATION_TYPE.BAND
		};

		let matchedOrg = await this.#db.Organisation.findOne({
			where: {
				Slug: slug
			}
		});

		if (matchedOrg) {
			Object.keys(org).forEach(o => {
				matchedOrg[o] = org[o];
			});
			await matchedOrg.save();
		} else {
			matchedOrg = await this.#db.Organisation.create(org);
		}

		return matchedOrg;
	}

	async addContactToOrganisation(organisation, contact){
		const match = await organisation.getOrganisationUsers({
			include: [{
				model: this.#db.User,
				where: {
					Email: contact.Email,
					IsActive: true
				}
			}]
		});

		if (!match || match.length == 0){
			await this.#db.OrganisationUser.create({
				IsActive: true,
				OrganisationId: organisation.id,
				UserId: contact.id
			});
		}
	}

	async processOrganisationMembership(orgName, contact) {
		const org = await this.getOrganisation(orgName);
		await this.addContactToOrganisation(org, contact);

		const membershipMatch = await this.#db.OrganisationMembership.findOne({
			where: {
				OrganisationId: org.id
			},
			include: [
				{
					model: this.#db.Membership,
					where: {
						SeasonId: this.#season.id
					},
				},
				this.#db.Organisation
			]
		});

		if (membershipMatch) {
			return membershipMatch;
		}

		const orgMembership = await this.#db.OrganisationMembership.create({
			OrganisationId: org.id
		});

		orgMembership.Organisation = org;

		return orgMembership;
	}

	async processIndividualMembership(contact) {
		const membershipMatch = await this.#db.IndividualMembership.findOne({
			where: {
				UserId: contact.id
			},
			include: {
				model: this.#db.Membership,
				where: {
					SeasonId: this.#season.id
				}
			}
		});

		if (membershipMatch) {
			return membershipMatch;
		}

		const individualMembership = await this.#db.IndividualMembership.create({
			UserId: contact.id
		});

		return individualMembership;
	}

	async processOrderLine(item, contact, org, startDate, photoConsent) {
		const membershipType = this.#products.find(p => p.ExternalId == item.product_id);
		if (!membershipType) {
			return null;
		}

		let orgMembership = null, individualMembership = null;
		if (membershipType.IsOrganisation) {
			orgMembership = await this.processOrganisationMembership(org, contact);

			const consentTypeId = photoConsent.trim() == 'Yes' ? 3 : 1;

			const recentUpdate = await this.#db.PhotoConsentHistory.findOne({
				where: {
					createdAt: {
						[Op.gt]: startDate
					},
					OrganisationId: orgMembership.Organisation.id
				}
			});

			if (!recentUpdate && orgMembership.Organisation.PhotoConsentTypeId != consentTypeId){
				//if order is more recent than last consent update
				//update consent to match order

				await Promise.all([
					this.#db.PhotoConsentHistory.create({
						Description: 'Consent type updated from web order',
						OldConsentTypeId: orgMembership.Organisation.PhotoConsentTypeId,
						NewConsentTypeId: consentTypeId,
						OrganisationId: orgMembership.Organisation.id,
						UserId: contact.id
					}),
					this.#db.Organisation.update({
						PhotoConsentTypeId: consentTypeId
					}, {
						where: {
							id: orgMembership.Organisation.id
						}
					})
				]);
			}

			if (!orgMembership._options.isNewRecord) {
				return orgMembership.Membership;
			}
		} else {
			individualMembership = await this.processIndividualMembership(contact);

			if (!individualMembership._options.isNewRecord) {
				return individualMembership.Membership;
			}
		}

		const membership = await this.#db.Membership.create({
			DateStarted: startDate,
			SeasonId: this.#season.id,
			MembershipTypeId: membershipType.id
		});

		if (orgMembership){
			await membership.setOrganisationMembership(orgMembership);
		} else {
			await membership.setIndividualMembership(individualMembership);
		}

		return membership;
	}

	getMetaData(order, keyID) {
		const key = order.meta_data.find(m => m.key == keyID);
		if (!key) {
			return '';
		}

		return key.value;
	}

	async setPaymentStatus(membership, startDate) {
		const fee = await membership.getFee();
		fee.IsPaid = true;
		fee.PaymentDate = startDate;
		fee.PaymentTypeId = 4; //online
		fee.save();
	}

	shouldProcessOrder(order){
		return order.line_items.some(x => this.#products.some(p => p.ExternalId === x.product_id));
	}

	async process(order) {
		if (!this.shouldProcessOrder(order)){
			return [];
		}

		const contact = await this.getContact(order);
		const org = this.getMetaData(order, '_billing_wooccm13');
		const photoConsent = this.getMetaData(order, '_billing_wooccm21');
		const memberships = [];

		for (let i = 0; i < order.line_items.length; i++) {
			if (order.needs_payment || order.refunds.length > 0 || !order.date_completed) {
				continue;
			}

			let membership = await this.processOrderLine(order.line_items[i], contact, org, order.date_paid, photoConsent);
			if (membership == null) {
				continue;
			}

			const promises = [this.setPaymentStatus(membership, order.date_paid)];
			const newRecord = membership._options.isNewRecord;

			if (!membership.Entity) {
				promises.push(this.#db.Membership.findByPk(membership.id, {
					include: [
						{
							model: this.#db.IndividualMembership,
							include: [this.#db.User]
						},
						{
							model: this.#db.OrganisationMembership,
							include: [
								{
									model: this.#db.Organisation
								}
							]
						}]
				}));
			} else {
				promises.push(membership);
			}

			[, membership] = await Promise.all(promises);
			membership.isNewRecord = newRecord;
			memberships.push(membership);
		}

		return memberships;
	}
}

module.exports = WPOrderProcessor;