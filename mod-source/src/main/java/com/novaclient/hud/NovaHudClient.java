package com.novaclient.hud;

import com.novaclient.hud.screen.NovaHudConfigScreen;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import org.lwjgl.glfw.GLFW;

public class NovaHudClient implements ClientModInitializer {
    private static KeyBinding hudKeyBinding;
    public static boolean showEditor = false;

    @Override
    public void onInitializeClient() {
        // Register Right Caps Lock / F8 / Insert keybinding
        hudKeyBinding = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "key.novahud.toggle",
                InputUtil.Type.KEYSYM,
                GLFW.GLFW_KEY_F8, // Default to F8 (Right CapsLock is GLFW_KEY_RIGHT_SHIFT or custom check)
                "category.novahud.general"
        ));

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            while (hudKeyBinding.wasPressed()) {
                if (client.player != null) {
                    client.setScreen(new NovaHudConfigScreen(null));
                }
            }
        });
    }
}
