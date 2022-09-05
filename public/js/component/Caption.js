'use strict';
/*global Vue, id:writable*/

Vue.component('caption-selector', {
	props: ['caption'],
	template: `
	<div class="col">
		<div class="card card-body mb-3">
			<div class="form-group mb-3">
				<label :for="'name-' + caption.id">Name</label>
				<input type="text" class="form-control" :id="'name-' + caption.id" v-model="caption.Name" />
			</div>

			<div class="form-group mb-3">
				<label :for="'maxScore-' + caption.id">Max Score</label>
				<input type="number" class="form-control" :id="'maxScore-' + caption.id" v-model="caption.MaxScore" v-if="caption.Subcaptions.length === 0" />
				<input type="number" class="form-control" :id="'maxScore-' + caption.id" :value="maxScore" v-if="caption.Subcaptions.length > 0" disabled />
			</div>

			<div class="form-group mb-3">
				<label :for="'multiplier-' + caption.id">Multiplier</label>
				<input type="number" class="form-control" :id="'multiplier-' + caption.id" v-model="caption.Multiplier" step="0.01"/>
			</div>

			<div class="form-group mb-3">
				<label :for="'optional-' + caption.id">Is Optional?</label>
				<div class="btn-group" role="group" aria-label="Is Optional?">
					<input type="radio" value="true" class="btn-check" :name="'optional-' + caption.id" :id="'optional-y-' + caption.id" autocomplete="off" v-model="caption.IsOptional">
					<label class="btn btn-outline-success" :for="'optional-y-' + caption.id">Yes</label>

					<input type="radio" value="false" class="btn-check" :name="'optional-' + caption.id" :id="'optional-n-' + caption.id" autocomplete="off" v-model="caption.IsOptional">
					<label class="btn btn-outline-danger" :for="'optional-n-' + caption.id">No</label>
				</div>
			</div>

			<button class="btn btn-default mb-3" type="button" v-on:click="addCaption">+ Add</button>

			<div class="row row-cols-1 row-cols-lg-2">
				<caption-selector v-for="c in caption.Subcaptions" :key="c.id" :caption="c" />
			</div>
		</div>
	</div>
	`,
	methods: {
		addCaption() {
			this.caption.Subcaptions.push({
				id: --id,
				Name: '',
				IsOptional: false,
				MaxScore: 0,
				Multiplier: 1.0,
				Subcaptions: []
			});
		}
	},
	computed: {
		maxScore: function() {
			if (this.caption.Subcaptions.length > 0) {
				this.caption.MaxScore = this.caption.Subcaptions.reduce((acc, cap) => {
					return acc + parseInt(cap.MaxScore);
				}, 0);
			}

			return this.caption.MaxScore;
		}
	}
});