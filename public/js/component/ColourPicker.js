'use strict';
/*global Vue*/

Vue.component('colour-picker', {
	props: ['value', 'title', 'name'],
	template: `
	<div class="card mb-3">
		<div class="card-header">
			<label :for="name">{{title}}</label>
		</div>
		<div class="card-body">
			<div class="row">
				<div class="col-9">
					<div class="input-group">
						<input type="text" class="form-control" maxlength="20" :id="name" :name="name" v-bind:value="value" v-on:input="$emit('input', $event.target.value)" />
					</div>
				</div>
				<div class="col-3">
					<input type="color" class="form-control form-control-color" v-bind:value="value" v-on:input="$emit('input', $event.target.value)" />
				</div>
			</div>
		</div>
	</div>
	`
});