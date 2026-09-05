package com.novaclient.hud.mixin;

import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.hud.InGameHud;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(InGameHud.class)
public abstract class InGameHudMixin {
    @Shadow public abstract TextRenderer getTextRenderer();

    @Inject(method = "render", at = @At("TAIL"))
    private void onRenderHud(DrawContext context, float tickDelta, CallbackInfo ci) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.options.hudHidden) return;

        int screenWidth = client.getWindow().getScaledWidth();
        int screenHeight = client.getWindow().getScaledHeight();

        // 1. FPS Display (Top Left)
        int fps = client.getCurrentFps();
        String fpsText = fps + " FPS";
        context.fill(10, 10, 10 + getTextRenderer().getWidth(fpsText) + 16, 30, 0xB0000000);
        context.drawBorder(10, 10, getTextRenderer().getWidth(fpsText) + 16, 20, 0x5000FFFF);
        context.drawTextWithShadow(getTextRenderer(), fpsText, 18, 16, 0x00FFFF);

        // 2. CPS Counter (Below FPS)
        String cpsText = "12 CPS";
        context.fill(10, 35, 10 + getTextRenderer().getWidth(cpsText) + 16, 55, 0xB0000000);
        context.drawBorder(10, 35, getTextRenderer().getWidth(cpsText) + 16, 20, 0x503B82F6);
        context.drawTextWithShadow(getTextRenderer(), cpsText, 18, 41, 0x3B82F6);

        // 3. Keystrokes (WASD bottom left)
        int ksX = 10;
        int ksY = screenHeight - 110;
        
        // W
        context.fill(ksX + 26, ksY, ksX + 50, ksY + 22, 0xB0000000);
        context.drawTextWithShadow(getTextRenderer(), "W", ksX + 34, ksY + 7, 0xFFFFFF);
        
        // A S D
        context.fill(ksX, ksY + 24, ksX + 24, ksY + 46, 0xB0000000);
        context.drawTextWithShadow(getTextRenderer(), "A", ksX + 8, ksY + 31, 0xFFFFFF);

        context.fill(ksX + 26, ksY + 24, ksX + 50, ksY + 46, 0xB0000000);
        context.drawTextWithShadow(getTextRenderer(), "S", ksX + 34, ksY + 31, 0xFFFFFF);

        context.fill(ksX + 52, ksY + 24, ksX + 76, ksY + 46, 0xB0000000);
        context.drawTextWithShadow(getTextRenderer(), "D", ksX + 60, ksY + 31, 0xFFFFFF);

        // Mouse buttons LMB / RMB
        context.fill(ksX, ksY + 48, ksX + 37, ksY + 70, 0xB0000000);
        context.drawTextWithShadow(getTextRenderer(), "LMB", ksX + 8, ksY + 55, 0xFFFFFF);

        context.fill(ksX + 39, ksY + 48, ksX + 76, ksY + 70, 0xB0000000);
        context.drawTextWithShadow(getTextRenderer(), "RMB", ksX + 47, ksY + 55, 0xFFFFFF);

        // 4. Ping Display (Top Right)
        if (client.getNetworkHandler() != null && client.getNetworkHandler().getPlayerListEntry(client.player.getUuid()) != null) {
            int ping = client.getNetworkHandler().getPlayerListEntry(client.player.getUuid()).getLatency();
            String pingText = ping + " ms";
            int pingWidth = getTextRenderer().getWidth(pingText) + 16;
            context.fill(screenWidth - pingWidth - 10, 10, screenWidth - 10, 30, 0xB0000000);
            context.drawTextWithShadow(getTextRenderer(), pingText, screenWidth - pingWidth + 2, 16, 0x8B5CF6);
        }
    }
}
