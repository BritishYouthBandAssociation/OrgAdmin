'use strict';
/*global Vue, id:writable*/

Vue.component('caption-selector', {
	props: ['caption'],
	template: `
	<div class="col">
		<div class="card card-body mb-3">
			<div class="form-group mb-3">
				<label :for="'name-' + caption.id">Name</label>
				<input type="text" class="form-control" :id="'name-' + caption.id" v-model="caption.name" />
			</div>

			<button class="btn btn-default mb-3" type="button" v-on:click="addCaption">+ Add</button>

			<div class="row row-cols-1 row-cols-lg-2">
				<caption-selector v-for="c in caption.subcaptions" :key="c.id" :caption="c" />
			</div>
		</div>
	</div>
	`,
	methods: {
		addCaption(){
			this.caption.subcaptions.push({
				id: --id,
				name: '',
				subcaptions: []
			});
		}
	}
});