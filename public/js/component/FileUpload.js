'use strict';
/*global Vue*/

Vue.component('file-upload', {
	props: ['src', 'title', 'name', 'accept', 'instructions'],
	template: `
	<div class="card mb-3">
		<div class="card-header">
			<label :for="name">{{title}}</label>
		</div>
		<div class="card-body">
			<img :src="url" class="img-fluid" />
			<input type="file" :name="name" :accept="fileType" class="form-control" v-on:change="changeFile" />
			<p v-html="instructions" v-if="instructions != null && instructions.length > 0"></p>
		</div>
	</div>
	`,
	methods: {
		changeFile(e){
			const file = e.target.files[0];
			this.url = URL.createObjectURL(file);
		}
	},
	data: function() {
		return {
			url: '',
			fileType: ''
		};
	},
	mounted: function() {
		this.url = this.src;
		this.fileType = this.accept ?? '*';
	}
});