# How we build ThingyWorld for Embedded World 2020

![Screenshot of world.thingy.rocks](https://raw.githubusercontent.com/coderbyheart/nrfcloud-udp-proxy/blogpost/map.png)

When we wanted to show off our favorite development kit, the [Thingy:91](https://www.nordicsemi.com/Software-and-tools/Prototyping-platforms/Nordic-Thingy-91), at last years embedded world in Nuremburg, we discovered that because of the high volume of devices at the fair location, the TCP packets our Thingys were sending on the NB-IoT network were dropped. To be fair, using TCP on an NB-IoT network is a compatibility hack to simplify development, but this mobile network standard is explicitly not designed for devices that need TCP and TLS end-to-end secure connections.

To prepare for this we wanted to use UDP in 2020 to be able to reliably send real-time updates from the trade show floor. Since [nRF Connect for Cloud](https://nrfcloud.com/), which is based on [AWS IoT Core](https://aws.amazon.com/iot-core/) only supports TCP+TLS we needed an alternative way to connect the devices.

We decided to modify the existing `asset_tracker` example from our [nRF Connect SDK](https://www.nordicsemi.com/Software-and-tools/Software/nRF-Connect-SDK) so it sends the messages intended for nRF Connect for Cloud to an *UDP proxy* instead

<blockquote class="twitter-tweet"><p lang="en" dir="ltr">The Thingy World Rocks demo shows our <a href="https://twitter.com/hashtag/Thingy91?src=hash&amp;ref_src=twsrc%5Etfw">#Thingy91</a> <a href="https://twitter.com/hashtag/cellularIoT?src=hash&amp;ref_src=twsrc%5Etfw">#cellularIoT</a> prototyping platform sending data to our nRF Connect for Cloud platform. The data is then extracted using the device API and shown on the map! Joakim shows you how. <a href="https://t.co/OT0XG7SrI8">https://t.co/OT0XG7SrI8</a> <a href="https://t.co/WXzFBkWDWG">pic.twitter.com/WXzFBkWDWG</a></p>&mdash; Nordic Semiconductor (@NordicTweets) <a href="https://twitter.com/NordicTweets/status/1233002090311671809?ref_src=twsrc%5Etfw">February 27, 2020</a></blockquote> 
<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
<!--stackedit_data:
eyJoaXN0b3J5IjpbMTg0MjUwNzE4OCwtODUyOTgwNzQ5LC0xMD
A4MDU4NjE0LC0xMDM3NDA1MTc1LDIxMDQ1Mjg5OTcsMTc3MTk1
NDM3LC0xMDY3OTk2NDM3XX0=
-->