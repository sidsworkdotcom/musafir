# Musafir

A cloud-based tourism booking platform built for the Cloud Computing project at TYBCA.

Musafir brings multiple travel services into one web application, allowing users to browse and book tour packages, flights, trains, and hotels from a single platform.

The application is deployed on Amazon Web Services (AWS), with the web application running on EC2 and MySQL hosted on Amazon RDS.

## What Musafir Does

- Browse tour packages, flights, trains, and hotels
- Search available travel services
- Create an account and verify email
- Secure login and password recovery
- Book travel services and calculate fares
- Apply coupons during checkout
- Make payments through Razorpay test mode
- Receive a unique booking reference
- Get e-tickets through email
- View and cancel bookings
- Submit reviews for eligible bookings
- Manage travel inventory through an admin panel

## Tech Stack

**Backend**
- Node.js
- Express.js

**Frontend**
- EJS
- HTML / CSS / JavaScript

**Database**
- MySQL 8.4
- Amazon RDS

**Cloud & Deployment**
- Amazon EC2
- Nginx
- PM2
- HTTPS / TLS

**Payments & Email**
- Razorpay
- SMTP

## AWS Architecture

Musafir follows a simple cloud-based deployment model.

The Node.js/Express application runs on an Amazon EC2 instance, while the MySQL database is hosted separately on Amazon RDS. Nginx acts as the reverse proxy and handles HTTPS traffic, while PM2 keeps the application process running.

The database is kept private and is accessed only by the application server.

```text
User
  |
  | HTTPS
  v
Nginx
  |
  v
Node.js / Express
  |
  +------------------> Amazon RDS (MySQL)
  |
  +------------------> Razorpay
  |
  +------------------> SMTP / Email
