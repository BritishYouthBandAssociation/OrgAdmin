'use strict';
/*global Vue*/

Vue.component('file-upload', {
	props: ['src', 'title', 'name', 'accept', 'instructions', 'token'],
	template: `
	<div class="card mb-3">
		<div class="card-header">
			<label :for="name">{{title}}</label>
		</div>
		<div class="card-body">
			<img :src="url" class="img-fluid mb-3" />
			<input type="file" :accept="fileType" class="form-control" v-on:change="changeFile" />
			<p v-html="instructions" v-if="instructions != null && instructions.length > 0"></p>

			<div class="mt-3">
				<div class="progress" v-if="progress > -1">
					<div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100" :style="{width: progress + '%'}"></div>
				</div>
			
			</div>
			
			<input type="hidden" :value="id" :name="name" />
		</div>
	</div>
	`,
	methods: {
		changeFile(e) {
			if (!e.target.files.length) {
				this.$emit('cancel');
				this.url = this.src;
				return;
			}

			const file = e.target.files[0];
			this.url = URL.createObjectURL(file);

			const data = new FormData();
			data.append('file', file);

			const xhr = new XMLHttpRequest();
			xhr.upload.onprogress = (e) => {
				this.progress = e.loaded / e.total * 100;
			};

			xhr.upload.onerror = (e) => {
				console.log(e);
			};

			xhr.upload.onload = (e) => {
				this.progress = 100;
			};

			xhr.onreadystatechange = () => {
				if (xhr.readyState === xhr.DONE) {
					const json = JSON.parse(xhr.responseText);
					this.id = json.Value.id;
					this.$emit('complete', this.id);
				}
			};

			xhr.open('POST', `${window.uploadServer}upload/new`);
			xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);
			xhr.send(data);

			this.progress = 0;
			this.$emit('start');
		}
	},
	data: function() {
		return {
			url: '',
			fileType: '',
			progress: -1,
			id: null
		};
	},
	mounted: function() {
		this.url = this.src;
		this.fileType = this.accept ?? '*';
	}
});