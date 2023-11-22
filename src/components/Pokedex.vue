<script setup>
import { onMounted, ref } from 'vue';

  const title = ref('Fetching Pokedex');
  const items = ref([]);

  const fetchPokedex = async () => {
    try {
      const response = await fetch('https://pokeapi.co/api/v2/pokemon');

      if (response.ok) {
        const data = await response.json();
        items.value = data;
      } else {
        console.error('Failed to fetch data');
      }
    } catch (error) {
      console.error('An error occured: ' + error);
    }
  }

  const samplePost = async () => {
    try {
      const request = new URLSearchParams();
      request.append('name', 'aku');
      request.append('salary', '1m');
      request.append('age', '17');

      const response = await fetch('https://dummy.restapiexample.com/api/v1/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: request
      });

      if (response.ok) {
        const data = await response.json();
        console.log(data);
      } else {
        console.error('Failed to send data');
      }
    } catch (error) {
      console.error('An error occured: ' + error);
    }
  }

  onMounted(fetchPokedex);
</script>

<template>
  <div>
    <h1>
      {{title}}
    </h1>
    <ul>
      <li v-for="item in items.results" :key="item.name">
        {{item.name}}
      </li>
    </ul>
    <button @click="samplePost">Send</button>
  </div>
</template>