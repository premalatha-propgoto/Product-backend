/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("product_views", (table) => {
    table.increments("id").primary(); // optional but useful

    table
      .integer("product_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("products")
      .onDelete("CASCADE");

    table.string("product_name", 255).notNullable();

    table.integer("view_count").defaultTo(0);

    table.timestamp("last_viewed_at").defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("product_views");
};