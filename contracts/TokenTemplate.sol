// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract TokenTemplate is ERC20Burnable, Ownable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint8 private constant _DECIMALS = 18;

    string private _tokenName;
    string private _tokenSymbol;

    constructor() ERC20("", "") Ownable(msg.sender) {
        // Clones do NOT run constructor
    }

    /// @notice Factory initializes clones and becomes temporary owner
    function initialize(
        string memory name_,
        string memory symbol_,
        address initialOwner
    ) external {
        require(owner() == address(0), "Already initialized");

        // Factory becomes owner temporarily
        _transferOwnership(initialOwner);

        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(MINTER_ROLE, initialOwner);

        _tokenName = name_;
        _tokenSymbol = symbol_;
    }

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    function name() public view override returns (string memory) {
        return _tokenName;
    }

    function symbol() public view override returns (string memory) {
        return _tokenSymbol;
    }

    function mint(address to, uint256 amount) external {
        require(hasRole(MINTER_ROLE, msg.sender), "Not minter");
        _mint(to, amount);
    }

    function revokeMinter(address sale) external onlyOwner {
        if (hasRole(MINTER_ROLE, sale)) _revokeRole(MINTER_ROLE, sale);
        if (hasRole(MINTER_ROLE, msg.sender)) _revokeRole(MINTER_ROLE, msg.sender);
    }

    function grantMinter(address sale) external onlyOwner {
        _grantRole(MINTER_ROLE, sale);
    }
}
