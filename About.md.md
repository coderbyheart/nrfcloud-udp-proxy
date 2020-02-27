# How we build a world map of Thingy:91s for Embedded World 2020

![Screenshot of world.thingy.rocks](https://raw.githubusercontent.com/coderbyheart/nrfcloud-udp-proxy/blogpost/map.png)

When we wanted to show off our favorite development kit, the [Thingy:91](https://www.nordicsemi.com/Software-and-tools/Prototyping-platforms/Nordic-Thingy-91), at last years embedded world in Nuremburg, we discovered that because of the high volume of devices at the fair location, the TCP packets our Thingys were sending on the NB-IoT network were dropped. To be fair, using TCP on an NB-IoT network is a compatibility hack to simplify development, but this mobile network standard is explicitly not designed for devices that need TCP and TLS end-to-end secure connections.

To prepare for this we wanted to use UDP in 2020 to be able to reliably send real-time updates from the trade show floor.
<!--stackedit_data:
eyJoaXN0b3J5IjpbLTg1Mjk4MDc0OSwtMTAwODA1ODYxNCwtMT
AzNzQwNTE3NSwyMTA0NTI4OTk3LDE3NzE5NTQzNywtMTA2Nzk5
NjQzN119
-->