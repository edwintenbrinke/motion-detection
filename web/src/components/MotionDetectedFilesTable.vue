<template>
  <v-container>
    <v-card>
      <v-card-title>
        Motion Detected Files
      </v-card-title>
      <v-card-text>

        <v-data-table-server
          v-model:items-per-page="pagination.itemsPerPage"
          :headers="headers"
          :items="items"
          :items-length="pagination.total"
          :loading="loading"
          item-value="file_name"
          :items-per-page-options="itemsPerPageOptions"
          @update:options="fetchData"
        ></v-data-table-server>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script>
export default {
  name: "MotionDetectedFilesTable",
  data() {
    return {
      headers: [
        { text: "File Name", value: "file_name" },
        { text: "File Path", value: "file_path" },
        { text: "Type", value: "type" },
        { text: "Detected At", value: "created_at" },
      ],
      items: [],
      itemsPerPageOptions: [1,5,10],
      pagination: {
        total: 0,
        currentPage: 1,
        itemsPerPage: 1,
      },
      loading: false,
    };
  },
  methods: {
    async fetchData() {
      this.loading = true;

      try {
        const { currentPage, itemsPerPage } = this.pagination;
        const response = await this.$api.get("/api/motion-detected-file", {
          params: {
            page: currentPage,
            itemsPerPage,
          },
        });

        this.items = response.data.data;
        this.pagination.total = response.data.total;
        this.pagination.itemsPerPage = response.data.itemsPerPage;
        this.pagination.currentPage = response.data.currentPage;
      } catch (error) {
        console.error("Error fetching data:", error);
        this.items = [];
        this.pagination.total = 0;
      } finally {
        this.loading = false;
      }
    },
    formatDate(dateString) {
      return new Date(dateString).toLocaleString();
    },
  },
  watch: {
    "pagination.currentPage": "fetchData",
    "pagination.itemsPerPage": "fetchData",
  },
  mounted() {
    this.fetchData();
  },
};
</script>

<style scoped>
.v-container {
  padding: 16px;
}
</style>
