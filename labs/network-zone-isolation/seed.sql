CREATE DATABASE IF NOT EXISTS labdb;
USE labdb;

CREATE TABLE IF NOT EXISTS customers (
    id INT PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    email VARCHAR(64) NOT NULL
);

INSERT IGNORE INTO customers (id, name, email) VALUES
    (1, 'Demo Customer One', 'demo-customer-1@example.invalid'),
    (2, 'Demo Customer Two', 'demo-customer-2@example.invalid'),
    (3, 'Demo Customer Three', 'demo-customer-3@example.invalid');
