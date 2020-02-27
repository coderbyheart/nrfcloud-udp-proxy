# How we build ThingyWorld for Embedded World 2020

![Screenshot of world.thingy.rocks](https://raw.githubusercontent.com/coderbyheart/nrfcloud-udp-proxy/blogpost/map.png)

When we wanted to show off our favorite development kit, the [Thingy:91](https://www.nordicsemi.com/Software-and-tools/Prototyping-platforms/Nordic-Thingy-91), at last years embedded world in Nuremburg, we discovered that because of the high volume of devices at the tradeshow, the TCP packets our Thingys were sending on the NB-IoT network were dropped. To be fair NB-IoT are not designed to be used for TCP and this can be considered a compatibility hack to simplify development with devices that need TCP and TLS end-to-end secure connections. For production deployments UDP should be used in NB-IoT networks.

To have a better experience in 2020 we needed to used UDP to be able to send real-time updates from the trade show floorat least with a _high_ probability of them reaching the cloud where the data is consolidated and visualized. But because [nRF Connect for Cloud](https://nrfcloud.com/), which is based on [AWS IoT Core](https://aws.amazon.com/iot-core/), only supports TCP+TLS we needed an alternative way to connect the devices.

We decided to modify the existing `asset_tracker` example from our [nRF Connect SDK](https://www.nordicsemi.com/Software-and-tools/Software/nRF-Connect-SDK) so it sends the messages intended for nRF Connect for Cloud MQTT broker to an *UDP proxy* instead. To simplify the communication we decided to not authenticate the devices any more and only use the IMEI of a device as an identifier. This removed the need for the rather complicated process of flashing certificates to devices and associating them with an nRF Connect for Cloud account; this is the task of the proxy server.

The proxy server listens for incoming messages in the format `<device id>:<JSON payload>` and registers an nRF Connect for Cloud device _on demand_ for devices that haven sent messages in before. This has serious security implications, but for a demo use-case this turned out to be a great solution.

We sent out one firmware hexfile to our field application engineers and withing  hours we had thingies connected 

<blockquote class="twitter-tweet"><p lang="en" dir="ltr">The Thingy World Rocks demo shows our <a href="https://twitter.com/hashtag/Thingy91?src=hash&amp;ref_src=twsrc%5Etfw">#Thingy91</a> <a href="https://twitter.com/hashtag/cellularIoT?src=hash&amp;ref_src=twsrc%5Etfw">#cellularIoT</a> prototyping platform sending data to our nRF Connect for Cloud platform. The data is then extracted using the device API and shown on the map! Joakim shows you how. <a href="https://t.co/OT0XG7SrI8">https://t.co/OT0XG7SrI8</a> <a href="https://t.co/WXzFBkWDWG">pic.twitter.com/WXzFBkWDWG</a></p>&mdash; Nordic Semiconductor (@NordicTweets) <a href="https://twitter.com/NordicTweets/status/1233002090311671809?ref_src=twsrc%5Etfw">February 27, 2020</a></blockquote> 
<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>

**Pre-built binaries in the release:**  
For LTE-M Network:  
_thingy91world_ltem_udp_300s_dfu.bin_  - For use with nrfcloud FOTA or mcumgr command line firmware update.  
_thingy91world_ltem_udp_300s_dfu.hex_  - For use with nRF Connect Programmer application.  
_thingy91world_ltem_udp_300s_full.hex_  - Full firmware image for use with external debug probe.

For NB-IoT Network:  
_thingy91world_nbiot_udp_300s_dfu.bin_  - For use with nrfcloud FOTA or mcumgr command line firmware update.  
_thingy91world_nbiot_udp_300s_dfu.hex_  - For use with nRF Connect Programmer application.  
_thingy91world_nbiot_udp_300s_full.hex_  - Full firmware image for use with external debug probe.
<!--stackedit_data:
eyJoaXN0b3J5IjpbLTEzNzI3NzA2NDUsLTg1Mjk4MDc0OSwtMT
AwODA1ODYxNCwtMTAzNzQwNTE3NSwyMTA0NTI4OTk3LDE3NzE5
NTQzNywtMTA2Nzk5NjQzN119
-->