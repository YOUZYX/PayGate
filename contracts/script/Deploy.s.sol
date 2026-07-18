// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {PayGateRouter} from "../src/PayGateRouter.sol";

contract DeployScript is Script {
    function run() external {
        uint256 pk = vm.envUint("WALLET_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        PayGateRouter router = new PayGateRouter(deployer);
        vm.stopBroadcast();

        console.log("PayGateRouter deployed at:", address(router));
        console.log("Treasury:", deployer);
    }
}
