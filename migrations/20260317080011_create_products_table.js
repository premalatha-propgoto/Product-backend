/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("products", (table) => {
    table.increments("id").primary(); 

    table.string("title", 255).notNullable();
    table.text("description");

    table.string("category", 100).notNullable();

    table.decimal("price", 10, 2).notNullable();
    table.decimal("discount_percentage", 5, 2).defaultTo(0);

    table.decimal("rating", 3, 2).defaultTo(0);

    table.integer("stock").notNullable().defaultTo(0);

    table.string("brand", 100);

    table.boolean("is_active").defaultTo(true);

    table.timestamps(true, true); 
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("products");
};