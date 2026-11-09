<template>
  <div class="home">
    <div>{{ a }}</div>
    <!-- <HelloWorld msg="Welcome to Your Vue.js App"/> -->
  </div>
</template>

<script>
// @ is an alias to /src
// import HelloWorld from '../components/HelloWorld.vue'

export default {
  name: "home",
  // components: {
  //   HelloWorld
  // },
  data() {
    return {
      a: "Hello World",
    };
  },
};
</script>
