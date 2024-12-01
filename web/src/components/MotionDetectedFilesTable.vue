<template>
  <v-container>
    <v-card>
      <v-card-title>
        Motion Detected Files
      </v-card-title>
      <v-card-text>
        <v-data-table
            :headers="headers"
            :items="items"
            :items-per-page="itemsPerPage"
            :page.sync="currentPage"
            :loading="loading"
            :server-items-length="totalItems"
            @update:options="fetchData"
        >
          <template v-slot:top>
            <v-toolbar flat>
              <v-spacer></v-spacer>
              <v-text-field
                  v-model="search"
                  label="Search"
                  clearable
                  class="mx-4"
                  @input="fetchData"
              ></v-text-field>
            </v-toolbar>
          </template>

          <template v-slot:no-data>
            No matching files found.
          </template>

          <template v-slot:progress>
            <v-progress-linear :indeterminate="true"></v-progress-linear>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script>
import axios from "axios";

export default {
  name: "MotionDetectedFilesTable",
  data() {
    return {
      headers: [
        { text: "ID", value: "id" },
        { text: "File Name", value: "fileName" },
        { text: "Detected At", value: "detectedAt" },
      ],
      items: [],
      totalItems: 0,
      currentPage: 1,
      itemsPerPage: 10,
      search: "",
      loading: false,
    };
  },
  methods: {
    async fetchData() {
      this.loading = true;

      try {
        const params = {
          page: this.currentPage,
          itemsPerPage: this.itemsPerPage,
          search: this.search,
        };

        const response = await this.$api.get('/api/motion-detected-file', { params });

        this.items = response.data.items;
        this.totalItems = response.data.totalItems;
      } catch (error) {
        console.error("Error fetching data:", error);
        this.items = [];
        this.totalItems = 0;
      } finally {
        this.loading = false;
      }
    },
  },
  watch: {
    itemsPerPage() {
      this.fetchData();
    },
    search() {
      this.fetchData();
    },
  },
  mounted() {
    this.fetchData();
  },
};
</script>

<style scoped>
.v-data-table {
  margin-top: 20px;
}
</style>
