# Skyport Daemon (skyportd)

## Overview
Skyport Daemon is the daemon for the Skyport Panel.

## Installation
1. Clone the repository:
`git clone https://github.com/skyportlabs/skyportd`

2. Install dependencies:
`npm install`

3. Configure Skyportd:
- Get your Panel's access key from the Skyport panel's config.json file and set it as 'remoteKey'. Do the same for the other way, set your skyportd access key and configure it on the Panel.

4. Start the Daemon:
`node . # or use pm2 to keep it online`

## Configuration
Configuration settings can be adjusted in the `config.json` file. This includes the authentication key for API access.

## Usage
The daemon runs as a background service, interfacing with the Skyport Panel for operational commands and status updates. It is not typically interacted with directly by end-users.

## Contributing
Contributions to enhance the functionality or performance of the Skyport Daemon are encouraged. Please submit pull requests for any enhancements.

## License
(c) 2024 Matt James and contributors. This software is licensed under the MIT License.
