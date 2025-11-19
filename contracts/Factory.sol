// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./TokenTemplate.sol";
import "./BondingCurveSale.sol";

contract Factory is Ownable {
    using Clones for address;

    address public immutable tokenImpl;
    address public immutable saleImpl;

    uint256 private _launchId;

    event LaunchCreated(
        uint256 indexed launchId,
        address indexed token,
        address indexed sale,
        bool externalToken,
        address creator
    );

    constructor(address token_, address sale_) Ownable(msg.sender) {
        require(token_ != address(0) && sale_ != address(0), "impl zero");
        tokenImpl = token_;
        saleImpl = sale_;
    }

    function createLaunch(
        string calldata name,
        string calldata symbol,
        BondingCurveSale.InitParams calldata initParams
    ) external returns (address tokenAddr, address saleAddr) {

        require(initParams.token == address(0), "Token specified");

        tokenAddr = tokenImpl.clone();
        saleAddr = saleImpl.clone();

        // Factory becomes temporary owner
        TokenTemplate(tokenAddr).initialize(name, symbol, address(this));

        // Now grant minter to sale
        TokenTemplate(tokenAddr).grantMinter(saleAddr);

        BondingCurveSale.InitParams memory params = initParams;
        params.token = tokenAddr;

        // Make Factory temporary owner
        BondingCurveSale(saleAddr).initialize(params);

        // Run audit
        BondingCurveSale(saleAddr).audit();

        // Transfer ownership to creator
        TokenTemplate(tokenAddr).transferOwnership(msg.sender);
        BondingCurveSale(saleAddr).transferOwnership(msg.sender);

        _launchId++;
        emit LaunchCreated(_launchId, tokenAddr, saleAddr, false, msg.sender);
    }

    function createExternalSale(
        BondingCurveSale.InitParams calldata initParams
    ) external returns (address saleAddr) {

        require(initParams.token != address(0), "Token not set");

        saleAddr = saleImpl.clone();

        // Factory becomes temporary owner
        BondingCurveSale(saleAddr).initialize(initParams);

        BondingCurveSale(saleAddr).transferOwnership(msg.sender);

        _launchId++;
        emit LaunchCreated(_launchId, initParams.token, saleAddr, true, msg.sender);
    }
}
