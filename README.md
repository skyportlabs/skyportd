# Skyport Daemon (skyportd)

## Overview
Skyport Daemon is a backend service that interfaces with Docker to manage and monitor containerized instances. It provides a robust API for real-time container management and data retrieval.

## Features
- Full Docker integration for container management.
- WebSocket endpoints for real-time monitoring and control.
- Authentication for secure access to management functions.
- Automated actions including container deployment, status checks, and power management.

## Installation
1. Clone the repository:
`git clone https://github.com/skyportlabs/skyportd`

2. Install dependencies:
`npm install`

3. Start the Daemon:
`node . # or use pm2 to keep it online`

## Configuration
Configuration settings can be adjusted in the `config.json` file. This includes Docker socket configurations and the authentication key for API access.

## Usage
The daemon runs as a background service, interfacing with the Skyport Panel for operational commands and status updates. It is not typically interacted with directly by end-users.

## Contributing
Contributions to enhance the functionality or performance of the Skyport Daemon are encouraged. Please submit pull requests for any enhancements.

## License
(c) 2024 Matt James and contributors. This software is licensed under the MIT License.
