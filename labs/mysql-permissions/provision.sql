-- Vulnerable baseline provisioning for the mysql-permissions lab.
-- Applied once against a freshly initialized data directory by
-- setup-vulnerable.sh (guarded by a provisioned-flag on the persistent
-- volume, so a plain restart never re-applies this over a student's fix).

-- ── Application database: what the order service is supposed to use ──
CREATE DATABASE IF NOT EXISTS app_db;

CREATE TABLE IF NOT EXISTS app_db.customers (
    customer_id INT PRIMARY KEY AUTO_INCREMENT,
    full_name   VARCHAR(100) NOT NULL,
    email       VARCHAR(100) NOT NULL,
    phone       VARCHAR(30)  NOT NULL
);

INSERT INTO app_db.customers (full_name, email, phone) VALUES
    ('Priya Nandakumar', 'priya.nandakumar@example.com', '+1-555-0181'),
    ('Marco Villanueva', 'marco.villanueva@example.com', '+1-555-0182'),
    ('Elin Karlsson',    'elin.karlsson@example.com',    '+1-555-0183'),
    ('Tunde Oyelaran',   'tunde.oyelaran@example.com',   '+1-555-0184'),
    ('Hana Watanabe',    'hana.watanabe@example.com',    '+1-555-0185');

CREATE TABLE IF NOT EXISTS app_db.orders (
    order_id    INT PRIMARY KEY AUTO_INCREMENT,
    customer_id INT NOT NULL,
    item        VARCHAR(100) NOT NULL,
    amount_usd  DECIMAL(10,2) NOT NULL,
    status      VARCHAR(20) NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES app_db.customers(customer_id)
);

INSERT INTO app_db.orders (customer_id, item, amount_usd, status) VALUES
    (1, 'Rack-mount UPS 1500VA',        349.00, 'shipped'),
    (2, 'Cat6a patch cable 50-pack',     89.50, 'processing'),
    (3, '10G SFP+ transceiver',        129.00, 'shipped'),
    (4, 'Managed 24-port switch',       599.00, 'processing'),
    (5, 'Rack shelf, 1U',                45.00, 'delivered');

-- ── HR database: a second, unrelated database on the same server. The
-- order application has no legitimate reason to touch it; it exists so
-- that "GRANT ALL ON *.*" has something sensitive to reach. ──
CREATE DATABASE IF NOT EXISTS hr_db;

CREATE TABLE IF NOT EXISTS hr_db.employees (
    employee_id  INT PRIMARY KEY AUTO_INCREMENT,
    full_name    VARCHAR(100) NOT NULL,
    role         VARCHAR(100) NOT NULL,
    annual_salary_usd DECIMAL(10,2) NOT NULL
);

INSERT INTO hr_db.employees (full_name, role, annual_salary_usd) VALUES
    ('Sofia Reyes',   'Site Reliability Engineer', 118000.00),
    ('Dmitri Ivanov',  'Database Administrator',    124000.00),
    ('Grace Boateng',  'Support Team Lead',          98000.00);

-- ── Vulnerable account: network-facing root with no password ──
CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED BY '';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;

-- ── Vulnerable account: anonymous user, readable app data ──
CREATE USER IF NOT EXISTS ''@'%' IDENTIFIED BY '';
GRANT SELECT ON app_db.* TO ''@'%';

-- ── Vulnerable account: application user with server-wide privileges
-- instead of scoped access to app_db only ──
CREATE USER IF NOT EXISTS 'app_user'@'%' IDENTIFIED BY 'app-demo-password';
GRANT ALL PRIVILEGES ON *.* TO 'app_user'@'%';

FLUSH PRIVILEGES;
