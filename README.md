# What is Markal
Markal is an open source productivity tool for creating interactive, collaborative, markable calendars, focused on privacy and ease of use. You can use it on any device, self-host it on your own infraestructure and it's easy to localize to support many more languages.

# Features
- Interactive calendars with customizable legend, date ranges, supports up to 4 legends per day
- Real-time collaboration, see your calendars come to life thanks to its peer-to-peer architecture
- Set your name and see who are connected to your calendar
- Export it to PDF/PNG and backup your data in a single file (you can restore it too)
- Multi-language localization

# Self-hosting Markal
Markal includes configuration files for Docker and [Fly.io](https://fly.io).
Note: Markal uses a signaling server to support WebRTC for peer-to-peer communication, however it can work without it (for a local-first approach).

## Docker
The easiest way is to set it up is using Docker Compose, using the provided ```docker-compose.yml``` file.

To run it, just execute the following command:

```bash
docker-compose up -d
```
## Fly.io
To deploy it using Fly, use the provided ```fly.toml``` file. Please note that it will use two virtual machines, one for the web app and the other for the signaling server (separated as processes within the same app).

You can then deploy it using:
```bash
flyctl deploy
```
